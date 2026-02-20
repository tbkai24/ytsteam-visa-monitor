import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Milestone = {
  id: string
  title: string
  target_count: number
  current_count: number
  is_active: boolean
  sort_order: number
}

type SnapshotRow = {
  captured_at: string
  views: number | null
}

function Milestones() {
  const [rows, setRows] = useState<Milestone[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [displayViews, setDisplayViews] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const loadSnapshots = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('monitoring_snapshots')
      .select('captured_at,views')
      .order('captured_at', { ascending: false })
      .limit(500)

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    if (data) {
      setSnapshots((data as SnapshotRow[]).reverse())
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('milestones')
        .select('id,title,target_count,current_count,is_active,sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        return
      }

      setRows((data ?? []) as Milestone[])
    }

    void load()
  }, [])

  useEffect(() => {
    void loadSnapshots()
    const timer = window.setInterval(() => {
      void loadSnapshots()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [loadSnapshots])

  const latestViews = snapshots[snapshots.length - 1]?.views
  const latestCapturedAt = snapshots[snapshots.length - 1]?.captured_at
  const lastCapturedAtLabel = latestCapturedAt
    ? new Date(latestCapturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : null
  const fallbackViews = useMemo(() => rows.reduce((max, row) => Math.max(max, row.current_count), 0), [rows])
  const previousViews = snapshots[snapshots.length - 2]?.views ?? latestViews ?? fallbackViews
  const previousCapturedAt = snapshots[snapshots.length - 2]?.captured_at
  const liveBaseViews = latestViews ?? fallbackViews
  const liveRatePerSecond = useMemo(() => {
    if (!latestCapturedAt || !previousCapturedAt) return 0
    const deltaViews = (latestViews ?? 0) - (previousViews ?? 0)
    const deltaSeconds = Math.max(
      1,
      (new Date(latestCapturedAt).getTime() - new Date(previousCapturedAt).getTime()) / 1000,
    )
    return Math.max(0, deltaViews / deltaSeconds)
  }, [latestCapturedAt, latestViews, previousCapturedAt, previousViews])
  const fallbackRatePerSecond = useMemo(() => {
    for (let i = snapshots.length - 1; i > 0; i -= 1) {
      const current = snapshots[i]
      const prev = snapshots[i - 1]
      const deltaViews = (current.views ?? 0) - (prev.views ?? 0)
      const deltaSeconds = Math.max(
        1,
        (new Date(current.captured_at).getTime() - new Date(prev.captured_at).getTime()) / 1000,
      )
      if (deltaViews > 0) {
        return deltaViews / deltaSeconds
      }
    }
    return 0
  }, [snapshots])
  const effectiveRatePerSecond = liveRatePerSecond > 0 ? liveRatePerSecond : fallbackRatePerSecond

  useEffect(() => {
    const startedAt = Date.now()
    setDisplayViews(liveBaseViews)

    const ticker = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000
      setDisplayViews(Math.round(liveBaseViews + elapsedSeconds * liveRatePerSecond))
    }, 1000)

    return () => {
      window.clearInterval(ticker)
    }
  }, [liveBaseViews, liveRatePerSecond])

  const currentViews = displayViews
  const achievedAtByTarget = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of rows) {
      const hit = snapshots.find((snapshot) => (snapshot.views ?? 0) >= row.target_count)
      if (hit?.captured_at) {
        map.set(row.target_count, hit.captured_at)
      }
    }
    return map
  }, [rows, snapshots])
  const formatAchievedDateTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  const formatEta = (remainingViews: number) => {
    if (effectiveRatePerSecond <= 0) return 'ETA: waiting update'
    const seconds = Math.ceil(remainingViews / effectiveRatePerSecond)
    if (seconds < 60) return `ETA: ${seconds}s`
    if (seconds < 3600) return `ETA: ${Math.ceil(seconds / 60)}m`
    if (seconds < 86400) return `ETA: ${(seconds / 3600).toFixed(1)}h`
    return `ETA: ${(seconds / 86400).toFixed(1)}d`
  }

  return (
    <div className="public-stack">
      <section className="public-hero public-hero-small">
        <h1>Milestones</h1>
        <p>Track progress and celebrate achievements</p>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="public-current">Current Views: {currentViews.toLocaleString()}</div>
        <div className="live-row">
          <span className="live-badge">LIVE</span>
          <span className="live-time">{lastCapturedAtLabel ? `Updated ${lastCapturedAtLabel}` : 'Waiting for feed...'}</span>
        </div>
        <div className="public-wide-progress">
          <span />
        </div>
      </section>

      <section className="public-stack">
        {rows.length === 0 ? <p className="muted">No milestones available.</p> : null}
        {rows.map((item) => {
          const percent = Math.max(0, Math.min(100, (currentViews / Math.max(1, item.target_count)) * 100))
          const achieved = percent >= 100
          const remaining = Math.max(0, item.target_count - currentViews)

          return (
            <article className="public-milestone-card" key={item.id}>
              <div className="public-badge">
                {item.target_count >= 1000000 ? `${item.target_count / 1000000}M` : `${Math.floor(item.target_count / 1000)}K`}
              </div>
              <div className="public-milestone-main">
                <div className="row-space">
                  <h3>{item.title}</h3>
                  <span className={`status-chip ${achieved ? 'achieved' : 'in-progress'}`}>
                    {achieved ? 'ACHIEVED' : 'IN PROGRESS'}
                  </span>
                </div>
                <p className="muted">
                  {achieved
                    ? `Achieved - ${
                        achievedAtByTarget.get(item.target_count)
                          ? formatAchievedDateTime(achievedAtByTarget.get(item.target_count) as string)
                          : 'Waiting for timestamp'
                      }`
                    : `${remaining.toLocaleString()} remaining - ${formatEta(remaining)}`}
                </p>
                <div className="public-wide-progress">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="public-percent">{Math.round(percent)}%</div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

export default Milestones
