import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

type AppSettingsRow = {
  id: number
  enable_range_1h?: boolean
  enable_range_24h?: boolean
  enable_range_7d?: boolean
}

type RangeKey = '1h' | '24h' | '7d'

type MonitoringSnapshot = {
  captured_at: string
  views: number | null
  likes: number | null
  comments: number | null
  views_per_hour: number | null
}

function ViewsMonitoring() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [enable1h, setEnable1h] = useState(true)
  const [enable24h, setEnable24h] = useState(true)
  const [enable7d, setEnable7d] = useState(true)
  const [downloadRange, setDownloadRange] = useState<RangeKey>('24h')
  const [snapshotViews, setSnapshotViews] = useState('')
  const [snapshotLikes, setSnapshotLikes] = useState('')
  const [snapshotComments, setSnapshotComments] = useState('')
  const [snapshotViewsPerHour, setSnapshotViewsPerHour] = useState('')
  const [snapshotCapturedAt, setSnapshotCapturedAt] = useState('')
  const [recentRows, setRecentRows] = useState<MonitoringSnapshot[]>([])
  const [allRows, setAllRows] = useState<MonitoringSnapshot[]>([])
  const [recentLoading, setRecentLoading] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotice(null)

    const { data, error: fetchError } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    if (data) {
      const row = data as AppSettingsRow
      setEnable1h(row.enable_range_1h ?? true)
      setEnable24h(row.enable_range_24h ?? true)
      setEnable7d(row.enable_range_7d ?? true)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const loadRecentSnapshots = useCallback(async () => {
    setRecentLoading(true)

    const { data, error: fetchError } = await supabase
      .from('monitoring_snapshots')
      .select('captured_at,views,likes,comments,views_per_hour')
      .order('captured_at', { ascending: true })
      .limit(6000)

    if (fetchError) {
      setError(
        `${fetchError.message}. Ensure table "monitoring_snapshots" exists with columns: captured_at, views, likes, comments, views_per_hour.`,
      )
      setRecentLoading(false)
      return
    }

    const ordered = (data ?? []) as MonitoringSnapshot[]
    setAllRows(ordered)
    setRecentRows([...ordered].slice(-20).reverse())
    setRecentLoading(false)
  }, [])

  useEffect(() => {
    void loadRecentSnapshots()
  }, [loadRecentSnapshots])

  const saveRangeSettings = async () => {
    if (!enable1h && !enable24h && !enable7d) {
      setError('At least one monitoring range must remain enabled.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)

    const payload = {
      id: 1,
      enable_range_1h: enable1h,
      enable_range_24h: enable24h,
      enable_range_7d: enable7d,
    }

    const { error: upsertError } = await supabase.from('app_settings').upsert(payload).eq('id', 1)
    if (upsertError) {
      if (upsertError.message.includes('enable_range_1h')) {
        setError(
          'Missing DB columns for range toggles. Run migration: add enable_range_1h, enable_range_24h, enable_range_7d to app_settings.',
        )
      } else {
        setError(upsertError.message)
      }
      setSaving(false)
      return
    }

    setNotice('Monitoring range settings saved.')
    setSaving(false)
  }

  const getRangeStartIso = (range: RangeKey) => {
    const now = new Date()
    const copy = new Date(now)

    if (range === '1h') copy.setHours(copy.getHours() - 1)
    if (range === '24h') copy.setHours(copy.getHours() - 24)
    if (range === '7d') copy.setDate(copy.getDate() - 7)

    return copy.toISOString()
  }

  const convertToCsv = (rows: MonitoringSnapshot[]) => {
    const header = ['captured_at', 'views', 'likes', 'comments', 'views_per_hour']
    const body = rows.map((row) => [
      row.captured_at,
      String(row.views ?? ''),
      String(row.likes ?? ''),
      String(row.comments ?? ''),
      String(row.views_per_hour ?? ''),
    ])
    return [header, ...body].map((line) => line.join(',')).join('\n')
  }

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    setNotice(null)

    const startIso = getRangeStartIso(downloadRange)
    const { data, error: fetchError } = await supabase
      .from('monitoring_snapshots')
      .select('captured_at,views,likes,comments,views_per_hour')
      .gte('captured_at', startIso)
      .order('captured_at', { ascending: true })

    if (fetchError) {
      setError(
        `${fetchError.message}. Ensure table "monitoring_snapshots" exists with columns: captured_at, views, likes, comments, views_per_hour.`,
      )
      setDownloading(false)
      return
    }

    const rows = (data ?? []) as MonitoringSnapshot[]
    if (rows.length === 0) {
      setNotice('No monitoring data found for selected range.')
      setDownloading(false)
      return
    }

    const csv = convertToCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monitoring-${downloadRange}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)

    setNotice(`Downloaded ${rows.length} rows.`)
    setDownloading(false)
  }

  const setNowTimestamp = () => {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    setSnapshotCapturedAt(local.toISOString().slice(0, 16))
  }

  const handleInsertSnapshot = async () => {
    if (!snapshotViews.trim()) {
      setError('Views is required to insert a snapshot.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)

    const payload = {
      views: Number(snapshotViews),
      likes: snapshotLikes.trim() ? Number(snapshotLikes) : null,
      comments: snapshotComments.trim() ? Number(snapshotComments) : null,
      views_per_hour: snapshotViewsPerHour.trim() ? Number(snapshotViewsPerHour) : null,
      captured_at: snapshotCapturedAt
        ? new Date(snapshotCapturedAt).toISOString()
        : new Date().toISOString(),
    }

    const { error: insertError } = await supabase.from('monitoring_snapshots').insert(payload)
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setSnapshotViews('')
    setSnapshotLikes('')
    setSnapshotComments('')
    setSnapshotViewsPerHour('')
    setSnapshotCapturedAt('')
    setNotice('Snapshot inserted.')
    await loadRecentSnapshots()
    setSaving(false)
  }

  const estimateRatePerSecond = (rows: Array<{ captured_at: string; views: number }>) => {
    if (rows.length < 2) return 0
    const latest = rows[rows.length - 1]
    const previous = rows[rows.length - 2]
    const liveDeltaViews = latest.views - previous.views
    const liveDeltaSeconds = Math.max(
      1,
      (new Date(latest.captured_at).getTime() - new Date(previous.captured_at).getTime()) / 1000,
    )
    const liveRate = Math.max(0, liveDeltaViews / liveDeltaSeconds)
    if (liveRate > 0) return liveRate

    for (let i = rows.length - 1; i > 0; i -= 1) {
      const current = rows[i]
      const prev = rows[i - 1]
      const deltaViews = current.views - prev.views
      const deltaSeconds = Math.max(
        1,
        (new Date(current.captured_at).getTime() - new Date(prev.captured_at).getTime()) / 1000,
      )
      if (deltaViews > 0) return deltaViews / deltaSeconds
    }
    return 0
  }

  const formatEtaFromRate = (remainingViews: number, ratePerSecond: number) => {
    if (ratePerSecond <= 0) return 'ETA: waiting update'
    const seconds = Math.ceil(remainingViews / ratePerSecond)
    if (seconds < 60) return `ETA: ${seconds}s`
    if (seconds < 3600) return `ETA: ${Math.ceil(seconds / 60)}m`
    if (seconds < 86400) return `ETA: ${(seconds / 3600).toFixed(1)}h`
    return `ETA: ${(seconds / 86400).toFixed(1)}d`
  }

  const hundredKRows = useMemo(() => {
    const valid = allRows
      .map((row) => ({ ...row, views: row.views ?? 0 }))
      .filter((row) => Number.isFinite(row.views))

    if (valid.length === 0) return []

    const maxViews = valid.reduce((max, row) => Math.max(max, row.views), 0)
    if (maxViews < 100000) return []

    const targets: number[] = []
    for (let target = 100000; target <= maxViews; target += 100000) {
      targets.push(target)
    }

    return targets
      .map((target) => {
        const crossIndex = valid.findIndex((row, index) => {
          const prevViews = index > 0 ? valid[index - 1].views : 0
          return prevViews < target && row.views >= target
        })

        if (crossIndex < 0) return null

        const reached = valid[crossIndex]
        const prev = crossIndex > 0 ? valid[crossIndex - 1] : null
        const historyUntilPrev = valid.slice(0, crossIndex)
        const ratePerSecond = estimateRatePerSecond(historyUntilPrev)
        const remaining = Math.max(0, target - (prev?.views ?? reached.views))

        return {
          target,
          reachedAt: reached.captured_at,
          reachedViews: reached.views,
          etaText: remaining <= 0 ? 'Reached' : formatEtaFromRate(remaining, ratePerSecond),
        }
      })
      .filter((row): row is { target: number; reachedAt: string; reachedViews: number; etaText: string } => row !== null)
      .sort((a, b) => b.target - a.target)
  }, [allRows])

  return (
    <div className="stack-md">
      <div className="admin-heading-row">
        <div>
          <h2>Views Monitoring</h2>
          <p className="muted">Control public range options and export monitoring snapshots</p>
        </div>
      </div>

      {error ? <p className="alert alert-error">{error}</p> : null}
      {notice ? <p className="alert alert-success">{notice}</p> : null}

      <Card className="admin-glass-card settings-card">
        {loading ? <p className="muted">Loading monitoring settings...</p> : null}
        {!loading ? (
          <div className="stack-md">
            <div className="stack-sm">
              <h3>Public Monitoring Ranges</h3>
              <div className="range-row">
                <span>Last 1 hour</span>
                <button
                  type="button"
                  className={`switch ${enable1h ? 'on' : ''}`}
                  onClick={() => setEnable1h((prev) => !prev)}
                  aria-label="Toggle 1 hour range"
                >
                  <span />
                </button>
              </div>
              <div className="range-row">
                <span>Last 24 hours</span>
                <button
                  type="button"
                  className={`switch ${enable24h ? 'on' : ''}`}
                  onClick={() => setEnable24h((prev) => !prev)}
                  aria-label="Toggle 24 hours range"
                >
                  <span />
                </button>
              </div>
              <div className="range-row">
                <span>Last 7 days</span>
                <button
                  type="button"
                  className={`switch ${enable7d ? 'on' : ''}`}
                  onClick={() => setEnable7d((prev) => !prev)}
                  aria-label="Toggle 7 days range"
                >
                  <span />
                </button>
              </div>
              <div className="button-row">
                <Button type="button" onClick={saveRangeSettings} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Range Settings'}
                </Button>
              </div>
            </div>

            <div className="stack-sm">
              <h3>Download Monitoring Sheet</h3>
              <div className="download-row">
                <select
                  className="select"
                  value={downloadRange}
                  onChange={(event) => setDownloadRange(event.target.value as RangeKey)}
                >
                  <option value="1h">Last 1 hour</option>
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                </select>
                <Button type="button" onClick={handleDownload} disabled={downloading}>
                  {downloading ? 'Preparing...' : 'Download CSV'}
                </Button>
              </div>
            </div>

            <div className="stack-sm">
              <h3>Manual Snapshot Entry</h3>
              <div className="inline-form">
                <Input
                  placeholder="Views (required)"
                  type="number"
                  min="0"
                  value={snapshotViews}
                  onChange={(event) => setSnapshotViews(event.target.value)}
                />
                <Input
                  placeholder="Likes"
                  type="number"
                  min="0"
                  value={snapshotLikes}
                  onChange={(event) => setSnapshotLikes(event.target.value)}
                />
                <Input
                  placeholder="Comments"
                  type="number"
                  min="0"
                  value={snapshotComments}
                  onChange={(event) => setSnapshotComments(event.target.value)}
                />
              </div>
              <div className="inline-form">
                <Input
                  placeholder="Views/hour"
                  type="number"
                  min="0"
                  step="0.01"
                  value={snapshotViewsPerHour}
                  onChange={(event) => setSnapshotViewsPerHour(event.target.value)}
                />
                <Input
                  type="datetime-local"
                  value={snapshotCapturedAt}
                  onChange={(event) => setSnapshotCapturedAt(event.target.value)}
                />
                <Button type="button" variant="ghost" onClick={setNowTimestamp}>
                  Use Now
                </Button>
              </div>
              <div className="button-row">
                <Button type="button" onClick={handleInsertSnapshot} disabled={saving}>
                  {saving ? 'Saving...' : 'Add Snapshot'}
                </Button>
              </div>
            </div>

            <div className="stack-sm">
              <h3>100k Reach Log</h3>
              <div className="table-wrap">
                <table className="table admin-table">
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>Reached At</th>
                      <th>ETA (pre-hit)</th>
                      <th>Views at Capture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLoading ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          Computing 100k reach log...
                        </td>
                      </tr>
                    ) : null}
                    {!recentLoading && hundredKRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          No 100k milestones reached yet.
                        </td>
                      </tr>
                    ) : null}
                    {!recentLoading
                      ? hundredKRows.map((row) => (
                          <tr key={`100k-${row.target}`}>
                            <td>{row.target.toLocaleString()}</td>
                            <td>{new Date(row.reachedAt).toLocaleString()}</td>
                            <td>{row.etaText}</td>
                            <td>{row.reachedViews.toLocaleString()}</td>
                          </tr>
                        ))
                      : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="stack-sm">
              <div className="row-space">
                <h3>Recent Snapshots</h3>
                <Button type="button" variant="ghost" onClick={() => void loadRecentSnapshots()}>
                  Refresh
                </Button>
              </div>
              <div className="table-wrap">
                <table className="table admin-table">
                  <thead>
                    <tr>
                      <th>Captured At</th>
                      <th>Views</th>
                      <th>Likes</th>
                      <th>Comments</th>
                      <th>Views/hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLoading ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          Loading recent snapshots...
                        </td>
                      </tr>
                    ) : null}
                    {!recentLoading && recentRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          No snapshots yet.
                        </td>
                      </tr>
                    ) : null}
                    {!recentLoading
                      ? recentRows.map((row, index) => (
                          <tr key={`${row.captured_at}-${index}`}>
                            <td>{new Date(row.captured_at).toLocaleString()}</td>
                            <td>{(row.views ?? 0).toLocaleString()}</td>
                            <td>{(row.likes ?? 0).toLocaleString()}</td>
                            <td>{(row.comments ?? 0).toLocaleString()}</td>
                            <td>{row.views_per_hour ?? 0}</td>
                          </tr>
                        ))
                      : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}

export default ViewsMonitoring
