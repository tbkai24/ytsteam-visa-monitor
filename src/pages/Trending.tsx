import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type TrendingRow = {
  category: 'overall' | 'music' | 'music_worldwide'
  country: string
  rank: number
  captured_at: string
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}

function Trending() {
  const mvUrlFromEnv = (import.meta.env.VITE_YOUTUBE_MV_URL ?? '').trim()
  const mvIdFromEnv = (import.meta.env.VITE_YOUTUBE_VIDEO_ID ?? '').trim() || '0t6GNcINKeU'
  const watchNowUrl = mvUrlFromEnv || `https://www.youtube.com/watch?v=${mvIdFromEnv}`

  const [rows, setRows] = useState<TrendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState<'overall' | 'music'>('overall')

  const loadTrending = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('visa_trending_current')
      .select('category,country,rank,captured_at')
      .eq('video_id', mvIdFromEnv)
      .order('category', { ascending: true })
      .order('rank', { ascending: true })
      .order('country', { ascending: true })

    if (queryError) {
      setError(queryError.message)
      setRows([])
      setLoading(false)
      return
    }

    setRows((data ?? []) as TrendingRow[])
    setError('')
    setLoading(false)
  }, [mvIdFromEnv])

  useEffect(() => {
    void loadTrending()
    const intervalId = window.setInterval(() => {
      void loadTrending()
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [loadTrending])

  const lastUpdated = useMemo(() => {
    if (!rows.length) return ''
    return formatDateTime(rows[0].captured_at)
  }, [rows])

  const overallRows = useMemo(() => rows.filter((row) => row.category === 'overall'), [rows])
  const musicRows = useMemo(() => rows.filter((row) => row.category === 'music'), [rows])
  const musicWorldwide = useMemo(
    () => rows.find((row) => row.category === 'music_worldwide' && row.country === 'Worldwide'),
    [rows],
  )
  const activeRows = activeCategory === 'overall' ? overallRows : musicRows

  return (
    <div className="public-stack">
      <section className="public-panel">
        <h2 className="trend-title">
          SB19 &apos;VISA&apos; Music Video |{' '}
          <a href={watchNowUrl} target="_blank" rel="noreferrer" className="trend-watch-link">
            Watch on YouTube
          </a>
        </h2>
        <p className="trend-meta">Trending: switch between Overall and Music</p>

        <div className="row-space trend-head-row">
          <p className="muted">Current trend from tracked countries</p>
          <button type="button" className="btn btn-ghost" onClick={() => void loadTrending()}>
            Refresh
          </button>
        </div>

        {lastUpdated ? <p className="muted trend-updated">Updated: {lastUpdated}</p> : null}

        {loading ? <p className="muted">Loading current trend...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error ? (
          <div className="trend-stack">
            <article className="trend-card trend-worldwide-card">
              <h3>Music Video Worldwide</h3>
              <p className="trend-worldwide-value">
                {musicWorldwide ? `#${musicWorldwide.rank}` : 'N/A'}
              </p>
            </article>

            <div className="trend-tabs" role="tablist" aria-label="Trending category">
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'overall'}
                className={`trend-tab ${activeCategory === 'overall' ? 'active' : ''}`}
                onClick={() => setActiveCategory('overall')}
              >
                Overall
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'music'}
                className={`trend-tab ${activeCategory === 'music' ? 'active' : ''}`}
                onClick={() => setActiveCategory('music')}
              >
                Music
              </button>
            </div>

            <article className="trend-card">
              <h3>{activeCategory === 'overall' ? 'Overall' : 'Music'}</h3>
              {activeRows.length ? (
                <ul className="trend-list">
                  {activeRows.map((entry) => (
                    <li key={`${activeCategory}-${entry.country}`}>
                      #{entry.rank} {entry.country}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  {activeCategory === 'overall'
                    ? 'No overall trend data yet.'
                    : 'No music trend data yet.'}
                </p>
              )}
            </article>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default Trending
