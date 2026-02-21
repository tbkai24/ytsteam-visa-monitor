import { useCallback, useEffect, useMemo, useState } from 'react'
import AnimatedCounter from '../components/ui/AnimatedCounter'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { supabase } from '../lib/supabase'

type MilestoneRow = {
  id: string
  title: string
  target_count: number
  current_count: number
  sort_order: number
  is_active: boolean
}

type SnapshotRow = {
  captured_at: string
  views: number | null
  likes: number | null
  comments: number | null
}

type AppSettingsRow = {
  hero_title?: string
  hero_subtitle?: string
  hero_image_url?: string
  enable_range_1h?: boolean
  enable_range_24h?: boolean
  enable_range_7d?: boolean
}

type RangeKey = '6h' | '12h' | '1d' | '3d' | '7d' | '30d'

const rangeOptions: Array<{ value: RangeKey; label: string }> = [
  { value: '6h', label: 'Last 6 hours' },
  { value: '12h', label: 'Last 12 hours' },
  { value: '1d', label: 'Last 1 day' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const CHART_WINDOW_MS = 2 * 60 * 60 * 1000
const CHART_TICK_MS = 5 * 60 * 1000

function Home() {
  const navigate = useNavigate()
  const [range, setRange] = useState<RangeKey>('1d')
  const [settings, setSettings] = useState<AppSettingsRow | null>(null)
  const [milestones, setMilestones] = useState<MilestoneRow[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dismissedCongratsTargets, setDismissedCongratsTargets] = useState<number[]>([])
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null)

  const loadSnapshots = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('monitoring_snapshots')
      .select('captured_at,views,likes,comments')
      .order('captured_at', { ascending: false })
      .limit(6000)

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    if (data) {
      setSnapshots((data as SnapshotRow[]).reverse())
    }
  }, [])

  useEffect(() => {
    void loadSnapshots()
    const fetchTimer = window.setInterval(() => {
      void loadSnapshots()
    }, 5000)
    const tickTimer = window.setInterval(() => {
      setNowTick(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(fetchTimer)
      window.clearInterval(tickTimer)
    }
  }, [loadSnapshots])

  useEffect(() => {
    const loadStatic = async () => {
      setError(null)
      const [settingsRes, milestonesRes] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase
          .from('milestones')
          .select('id,title,target_count,current_count,sort_order,is_active')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ])

      if (settingsRes.data) setSettings(settingsRes.data as AppSettingsRow)
      if (milestonesRes.data) setMilestones(milestonesRes.data as MilestoneRow[])

      const dbError = settingsRes.error ?? milestonesRes.error
      if (dbError) setError(dbError.message)
    }

    void loadStatic()
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('dismissed-congrats-targets')
      if (!raw) return
      const parsed = JSON.parse(raw) as number[]
      if (Array.isArray(parsed)) {
        setDismissedCongratsTargets(parsed.filter((value) => Number.isFinite(value)))
      }
    } catch {
      // ignore malformed storage
    }
  }, [])

  const enabledRanges = useMemo(() => rangeOptions, [])

  useEffect(() => {
    if (!enabledRanges.some((option) => option.value === range) && enabledRanges.length > 0) {
      setRange(enabledRanges[0].value)
    }
  }, [enabledRanges, range])

  const fallbackViews = useMemo(() => milestones.reduce((max, row) => Math.max(max, row.current_count), 0), [milestones])

  const rangeStart = useMemo(() => {
    const now = Date.now()
    if (range === '6h') return now - 6 * 60 * 60 * 1000
    if (range === '12h') return now - 12 * 60 * 60 * 1000
    if (range === '1d') return now - 24 * 60 * 60 * 1000
    if (range === '3d') return now - 3 * 24 * 60 * 60 * 1000
    if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000
    return now - 30 * 24 * 60 * 60 * 1000
  }, [range])

  const rangeSnapshots = useMemo(
    () => snapshots.filter((row) => new Date(row.captured_at).getTime() >= rangeStart),
    [snapshots, rangeStart],
  )

  const chartSnapshots = useMemo(() => {
    const windowStart = nowTick - CHART_WINDOW_MS
    return snapshots.filter((row) => new Date(row.captured_at).getTime() >= windowStart)
  }, [nowTick, snapshots])

  const chartModel = useMemo(() => {
    if (chartSnapshots.length < 2) return null
    const windowMs = CHART_WINDOW_MS
    const windowStart = nowTick - windowMs

    const pointsRaw = chartSnapshots.map((row) => ({
      t: new Date(row.captured_at).getTime(),
      v: row.views ?? 0,
    }))
    const lastRaw = pointsRaw[pointsRaw.length - 1]
    const pointsWithTail =
      lastRaw && lastRaw.t < nowTick ? [...pointsRaw, { t: nowTick, v: lastRaw.v }] : pointsRaw

    const values = pointsWithTail.map((point) => point.v)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const intervals = 4
    const step = 75000

    let axisMin = Math.floor(rawMin / step) * step
    let axisMax = axisMin + step * intervals

    if (rawMax > axisMax) {
      axisMax = Math.ceil(rawMax / step) * step
      axisMin = axisMax - step * intervals
    }

    if (axisMin < 0) {
      axisMin = 0
      axisMax = step * intervals
    }
    const axisRange = Math.max(1, axisMax - axisMin)

    const points = pointsWithTail.map((point, index) => {
      const x = Math.max(0, Math.min(100, ((point.t - windowStart) / windowMs) * 100))
      const y = 100 - ((point.v - axisMin) / axisRange) * 100
      return { x, y, t: point.t, v: point.v, index }
    })

    const createCurvePath = (pts: Array<{ x: number; y: number }>) => {
      if (pts.length === 0) return ''
      if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`

      let d = `M ${pts[0].x} ${pts[0].y}`
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = i === 0 ? pts[0] : pts[i - 1]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = i + 2 < pts.length ? pts[i + 2] : p2

        const cp1x = p1.x + (p2.x - p0.x) / 6
        const cp1y = p1.y + (p2.y - p0.y) / 6
        const cp2x = p2.x - (p3.x - p1.x) / 6
        const cp2y = p2.y - (p3.y - p1.y) / 6

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
      }
      return d
    }

    const linePath = createCurvePath(points)
    const firstPoint = points[0]
    const lastPoint = points[points.length - 1]
    const areaPath = `${linePath} L ${lastPoint.x} 100 L ${firstPoint.x} 100 Z`

    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4
      const y = ratio * 100
      const value = Math.round(axisMax - axisRange * ratio)
      return { y, value }
    })

    const xTickTimes: number[] = []
    let tick = Math.ceil(windowStart / CHART_TICK_MS) * CHART_TICK_MS
    for (; tick <= nowTick; tick += CHART_TICK_MS) {
      xTickTimes.push(tick)
    }
    if (xTickTimes.length === 0) {
      xTickTimes.push(windowStart, nowTick)
    }
    const xTicks = xTickTimes.map((tickTime) => ({
      x: Math.max(0, Math.min(100, ((tickTime - windowStart) / windowMs) * 100)),
      label: new Date(tickTime).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
    }))

    const first = pointsWithTail[0]?.v ?? 0
    const last = pointsWithTail[pointsWithTail.length - 1]?.v ?? 0
    const trend: 'up' | 'down' = last >= first ? 'up' : 'down'

    return { linePath, areaPath, xTicks, yTicks, trend, points }
  }, [chartSnapshots, nowTick])

  const bucketSnapshots = useMemo(() => {
    const bucketMs = 60 * 60 * 1000
    const grouped = new Map<number, SnapshotRow>()

    for (const row of rangeSnapshots) {
      const ts = new Date(row.captured_at).getTime()
      const key = Math.floor(ts / bucketMs) * bucketMs
      const current = grouped.get(key)
      if (!current || new Date(row.captured_at).getTime() > new Date(current.captured_at).getTime()) {
        grouped.set(key, row)
      }
    }

    return Array.from(grouped.values()).sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
    )
  }, [rangeSnapshots])

  const latest = rangeSnapshots[rangeSnapshots.length - 1]
  const previous = rangeSnapshots[rangeSnapshots.length - 2]
  const currentViews = latest?.views ?? fallbackViews
  const likesCount = latest?.likes ?? 0
  const commentsCount = latest?.comments ?? 0
  const lastCapturedAtLabel = latest?.captured_at
    ? new Date(latest.captured_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : null

  const likesDelta = (latest?.likes ?? 0) - (previous?.likes ?? 0)
  const commentsDelta = (latest?.comments ?? 0) - (previous?.comments ?? 0)
  const viewsDelta = (latest?.views ?? 0) - (previous?.views ?? 0)

  const formatDelta = (value: number) => {
    if (value > 0) return `+${value.toLocaleString()}`
    if (value < 0) return `-${Math.abs(value).toLocaleString()}`
    return '0'
  }

  const deltaClass = (value: number) => {
    if (value > 0) return 'up'
    if (value < 0) return 'down'
    return 'flat'
  }

  const nextMilestone = useMemo(
    () => milestones.find((row) => currentViews < row.target_count) ?? null,
    [currentViews, milestones],
  )
  const recentlyReachedMilestone = useMemo(() => {
    if (milestones.length === 0 || snapshots.length < 2) return null
    const cutoff = Date.now() - 60 * 60 * 1000
    let found:
      | {
          milestone: MilestoneRow
          reachedAt: string
        }
      | null = null

    for (let i = 1; i < snapshots.length; i += 1) {
      const prevViews = snapshots[i - 1].views ?? 0
      const currViews = snapshots[i].views ?? 0
      const reachedAtTime = new Date(snapshots[i].captured_at).getTime()
      if (reachedAtTime < cutoff) continue

      for (const milestone of milestones) {
        if (prevViews < milestone.target_count && currViews >= milestone.target_count) {
          if (!found || milestone.target_count > found.milestone.target_count) {
            found = { milestone, reachedAt: snapshots[i].captured_at }
          }
        }
      }
    }

    return found
  }, [milestones, snapshots])

  const showCongratsModal =
    recentlyReachedMilestone &&
    !dismissedCongratsTargets.includes(recentlyReachedMilestone.milestone.target_count)

  const heroImage = (settings?.hero_image_url ?? '').trim()
  const heroCoverImage = heroImage
    ? heroImage.replace('/hqdefault.jpg', '/maxresdefault.jpg').replace('/sddefault.jpg', '/maxresdefault.jpg')
    : ''
  const mvUrlFromEnv = (import.meta.env.VITE_YOUTUBE_MV_URL ?? '').trim()
  const mvIdFromEnv = (import.meta.env.VITE_YOUTUBE_VIDEO_ID ?? '').trim()
  const watchNowUrl = mvUrlFromEnv || (mvIdFromEnv ? `https://www.youtube.com/watch?v=${mvIdFromEnv}` : 'https://www.youtube.com/watch?v=0t6GNcINKeU')

  return (
    <div className="public-stack">
      {showCongratsModal ? (
        <div className="congrats-modal-backdrop">
          <div className="congrats-modal">
            <div className="congrats-emoji" aria-hidden>🎉</div>
            <h2>Congratulations A&apos;TIN!</h2>
            <p className="congrats-subtitle">SB19 &quot;VISA&quot; has reached</p>
            <p className="congrats-value">
              {recentlyReachedMilestone?.milestone.target_count.toLocaleString()}
            </p>
            <p className="congrats-subtitle">VIEWS</p>
            <p className="congrats-copy">Thank you for streaming and supporting!</p>
            <div className="button-row congrats-primary-row">
              <Button type="button" onClick={() => navigate('/milestones')}>
                View Milestones
              </Button>
            </div>
            <div className="button-row congrats-close-row">
              <Button
                type="button"
                variant="ghost"
                className="congrats-close-btn"
                onClick={() => {
                  if (!recentlyReachedMilestone) return
                  const next = [
                    ...dismissedCongratsTargets,
                    recentlyReachedMilestone.milestone.target_count,
                  ]
                  setDismissedCongratsTargets(next)
                  window.localStorage.setItem('dismissed-congrats-targets', JSON.stringify(next))
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="public-hero">
        <div className="public-hero-cover-wrap">
          {heroCoverImage ? <img src={heroCoverImage} alt="SB19 cover" className="public-hero-cover" /> : null}
          {heroImage ? (
            <img src={heroImage} alt="SB19 profile" className="public-hero-avatar" />
          ) : (
            <div className="public-band-photo" />
          )}
        </div>
        <h1>{settings?.hero_title ?? "SB19 - 'VISA' (Official MV)"}</h1>
        {settings?.hero_subtitle ? <p className="muted">{settings.hero_subtitle}</p> : null}
        {error ? <p className="alert alert-error">{error}</p> : null}
        <div className="public-total-wrap">
          <AnimatedCounter value={currentViews} durationMs={1200} className="public-total" />
        </div>
        <p className="public-total-caption">Views</p>
        <div className="live-row">
          <span className="live-badge">LIVE</span>
          <span className="live-time">{lastCapturedAtLabel ? `Updated ${lastCapturedAtLabel}` : 'Waiting for feed...'}</span>
        </div>
        <a
          href={watchNowUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="watch-now-btn"
        >
          Watch Now
        </a>
      </section>

      <section className="public-metrics-grid">
        <article className="public-metric-card">
          <p className="public-metric-value"><AnimatedCounter value={likesCount} durationMs={1200} /></p>
          <p className="public-metric-label">
            Likes <span className="metric-icon metric-like">👍</span>
          </p>
        </article>
        <article className="public-metric-card">
          <p className="public-metric-value">0</p>
          <p className="public-metric-label">
            Dislikes <span className="metric-icon metric-dislike">👎</span>
          </p>
        </article>
        <article className="public-metric-card">
          <p className="public-metric-value"><AnimatedCounter value={commentsCount} durationMs={1200} /></p>
          <p className="public-metric-label">
            Comments <span className="metric-icon metric-comment">💬</span>
          </p>
        </article>
      </section>

      <section className="public-grid-main">
        <article className="public-panel">
          <div className="row-space">
            <h3>Views</h3>
            <span className="pill">Last 2 hours</span>
          </div>
          <div className="public-chart-scroll">
            <div className="public-line-chart-wrap">
              {chartModel ? (
                <>
                  <div className="public-chart-y-axis">
                    {chartModel.yTicks.map((tick) => (
                      <span key={`${tick.y}-${tick.value}`}>{tick.value.toLocaleString()}</span>
                    ))}
                  </div>
                  <div
                    className="public-line-chart"
                    onMouseMove={(event) => {
                      if (!chartModel.points.length) return
                      const rect = event.currentTarget.getBoundingClientRect()
                      const xPercent = ((event.clientX - rect.left) / rect.width) * 100
                      let nearest = chartModel.points[0]
                      for (const point of chartModel.points) {
                        if (Math.abs(point.x - xPercent) < Math.abs(nearest.x - xPercent)) {
                          nearest = point
                        }
                      }
                      setHoveredChartIndex(nearest.index)
                    }}
                    onMouseLeave={() => setHoveredChartIndex(null)}
                  >
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      {chartModel.yTicks.map((tick) => (
                        <line key={`y-${tick.y}`} x1={0} y1={tick.y} x2={100} y2={tick.y} className="public-chart-grid-line" />
                      ))}
                      {chartModel.xTicks.map((tick) => (
                        <line key={`x-${tick.x}`} x1={tick.x} y1={0} x2={tick.x} y2={100} className="public-chart-grid-line" />
                      ))}
                      <path
                        d={chartModel.areaPath}
                        className={`public-chart-area ${chartModel.trend === 'down' ? 'down' : 'up'}`}
                      />
                      <path
                        d={chartModel.linePath}
                        className={`public-chart-line ${chartModel.trend === 'down' ? 'down' : 'up'}`}
                      />
                      {hoveredChartIndex !== null ? (
                        <>
                          <line
                            x1={chartModel.points[hoveredChartIndex]?.x ?? 0}
                            y1={0}
                            x2={chartModel.points[hoveredChartIndex]?.x ?? 0}
                            y2={100}
                            className="public-chart-hover-line"
                          />
                          <circle
                            cx={chartModel.points[hoveredChartIndex]?.x ?? 0}
                            cy={chartModel.points[hoveredChartIndex]?.y ?? 0}
                            r={1.8}
                            className="public-chart-hover-dot"
                          />
                        </>
                      ) : null}
                    </svg>
                    {hoveredChartIndex !== null ? (
                      <div
                        className="public-chart-tooltip"
                        style={{
                          left: `${chartModel.points[hoveredChartIndex]?.x ?? 0}%`,
                          top: `${Math.max(6, (chartModel.points[hoveredChartIndex]?.y ?? 0) - 8)}%`,
                        }}
                      >
                        <span>{new Date(chartModel.points[hoveredChartIndex]?.t ?? nowTick).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}</span>
                        <strong>{(chartModel.points[hoveredChartIndex]?.v ?? 0).toLocaleString()} views</strong>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="muted">Not enough data for chart yet.</p>
              )}
            </div>
            {chartModel ? (
              <div className="public-chart-x-axis">
                {chartModel.xTicks.map((tick, index) => (
                  <span key={`${tick.label}-${index}`}>{tick.label}</span>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <article className="public-panel">
          <div className="row-space">
            <h3>Next Milestone</h3>
            <span className="pill">Last 1 hour</span>
          </div>
          {nextMilestone ? (
            <>
              <p className="public-next-target">{nextMilestone.target_count.toLocaleString()} views</p>
              <p className="public-next-remaining">{Math.max(0, nextMilestone.target_count - currentViews).toLocaleString()} remaining</p>
              <div className="public-mini-progress">
                <span style={{ width: `${Math.max(0, Math.min(100, (currentViews / nextMilestone.target_count) * 100))}%` }} />
              </div>
              <p className="muted">
                {Math.max(0, Math.min(100, (currentViews / nextMilestone.target_count) * 100)).toFixed(2)}%
              </p>
            </>
          ) : (
            <p className="muted">No pending milestone.</p>
          )}
        </article>
      </section>

      <section className="public-panel">
        <div className="row-space">
          <h3>Analytics</h3>
          <select className="select public-select" value={range} onChange={(event) => setRange(event.target.value as RangeKey)}>
            {enabledRanges.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="table public-table">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Views</th>
                <th>+/-</th>
                <th>Likes</th>
                <th>+/-</th>
                <th>Comments</th>
                <th>+/-</th>
              </tr>
            </thead>
            <tbody>
              {bucketSnapshots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">No monitoring snapshots yet.</td>
                </tr>
              ) : null}
              {bucketSnapshots
                .slice()
                .reverse()
                .slice(0, 24)
                .map((row, index, arr) => {
                  const prev = arr[index + 1]
                  const vDelta = (row.views ?? 0) - (prev?.views ?? 0)
                  const lDelta = (row.likes ?? 0) - (prev?.likes ?? 0)
                  const cDelta = (row.comments ?? 0) - (prev?.comments ?? 0)
                  return (
                    <tr key={`${row.captured_at}-${index}`}>
                      <td>{new Date(row.captured_at).toLocaleString()}</td>
                      <td>{(row.views ?? 0).toLocaleString()}</td>
                      <td className={deltaClass(vDelta)}>{formatDelta(vDelta)}</td>
                      <td>{(row.likes ?? 0).toLocaleString()}</td>
                      <td className={deltaClass(lDelta)}>{formatDelta(lDelta)}</td>
                      <td>{(row.comments ?? 0).toLocaleString()}</td>
                      <td className={deltaClass(cDelta)}>{formatDelta(cDelta)}</td>
                    </tr>
                  )
                })}
              {rangeSnapshots.length > 0 ? (
                <tr>
                  <td>Latest Change</td>
                  <td>{(latest?.views ?? 0).toLocaleString()}</td>
                  <td className={deltaClass(viewsDelta)}>{formatDelta(viewsDelta)}</td>
                  <td>{(latest?.likes ?? 0).toLocaleString()}</td>
                  <td className={deltaClass(likesDelta)}>{formatDelta(likesDelta)}</td>
                  <td>{(latest?.comments ?? 0).toLocaleString()}</td>
                  <td className={deltaClass(commentsDelta)}>{formatDelta(commentsDelta)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default Home
