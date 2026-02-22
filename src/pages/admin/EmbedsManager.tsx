import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { PencilIcon, TrashIcon } from '../../components/ui/Icons'
import Input from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

type EmbedRow = {
  id: string
  title: string
  url: string
  thumbnail_url?: string | null
  sort_order: number
  is_active: boolean
}

type LinkSuggestion = {
  title: string | null
  subtitle: string | null
  thumbnail: string | null
}

type ClickEventRow = {
  embed_id: string
  clicked_at: string
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)

const deriveTitleFromUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    const slug = parsed.pathname.split('/').filter(Boolean).pop() ?? parsed.hostname
    return decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim() || parsed.hostname
  } catch {
    return value.trim()
  }
}

function EmbedsManager() {
  const [rows, setRows] = useState<EmbedRow[]>([])
  const [activeTab, setActiveTab] = useState<'links' | 'insights'>('links')
  const [insightRange, setInsightRange] = useState<'6h' | '12h' | '1d' | '3d' | '7d' | '30d' | 'custom'>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null)
  const [suggestedThumbnail, setSuggestedThumbnail] = useState<string | null>(null)
  const [titleTouched, setTitleTouched] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState('Choose the files to upload')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [clickEvents, setClickEvents] = useState<ClickEventRow[]>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const thumbInputRef = useRef<HTMLInputElement | null>(null)
  const formCardRef = useRef<HTMLDivElement | null>(null)

  const loadEmbeds = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('embeds')
      .select('id,title,url,thumbnail_url,sort_order,is_active')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setRows((data ?? []) as EmbedRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadEmbeds()
  }, [loadEmbeds])

  const loadClickAnalytics = useCallback(async () => {
    if (rows.length === 0) {
      setClickEvents([])
      return
    }

    setAnalyticsLoading(true)
    const now = Date.now()
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error: fetchError } = await supabase
      .from('embed_click_events')
      .select('embed_id,clicked_at')
      .gte('clicked_at', since30)

    if (fetchError) {
      setError(fetchError.message)
      setAnalyticsLoading(false)
      return
    }

    const events = (data ?? []) as ClickEventRow[]
    setClickEvents(events)
    setAnalyticsLoading(false)
  }, [rows])

  useEffect(() => {
    void loadClickAnalytics()
  }, [loadClickAnalytics])

  useEffect(() => {
    if (customFrom && customTo) return
    const now = new Date()
    const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    setCustomFrom(past.toISOString().slice(0, 16))
    setCustomTo(now.toISOString().slice(0, 16))
  }, [customFrom, customTo])

  const fetchSuggestion = useCallback(async (sourceUrl: string): Promise<LinkSuggestion> => {
    const encoded = encodeURIComponent(sourceUrl)

    try {
      const micro = await fetch(`https://api.microlink.io/?url=${encoded}`)
      if (micro.ok) {
        const payload = (await micro.json()) as {
          data?: {
            title?: string
            description?: string
            image?: { url?: string }
            logo?: { url?: string }
          }
        }
        return {
          title: payload.data?.title ?? null,
          subtitle: payload.data?.description ?? null,
          thumbnail: payload.data?.image?.url ?? payload.data?.logo?.url ?? null,
        }
      }
    } catch {
      // fallback below
    }

    try {
      const noembed = await fetch(`https://noembed.com/embed?url=${encoded}`)
      if (noembed.ok) {
        const payload = (await noembed.json()) as {
          title?: string
          thumbnail_url?: string
          author_name?: string
          provider_name?: string
        }
        return {
          title: payload.title ?? null,
          subtitle: [payload.author_name, payload.provider_name].filter(Boolean).join(' • ') || null,
          thumbnail: payload.thumbnail_url ?? null,
        }
      }
    } catch {
      // fallback below
    }

    return { title: null, subtitle: null, thumbnail: null }
  }, [])

  const applySuggestionFromUrl = useCallback(
    async (sourceUrl: string, autoFill = false) => {
      if (!isHttpUrl(sourceUrl)) {
        if (!autoFill) setSuggestionError('Enter a valid link (http/https) first.')
        return
      }

      setSuggesting(true)
      setSuggestionError(null)

      const suggestion = await fetchSuggestion(sourceUrl)
      const fallbackTitle = deriveTitleFromUrl(sourceUrl)
      const finalTitle = suggestion.title?.trim() || fallbackTitle
      setSuggestedTitle(finalTitle)
      setSuggestedThumbnail(suggestion.thumbnail ?? null)

      if (autoFill && !titleTouched && !title.trim()) {
        setTitle(finalTitle)
      }
      setSuggesting(false)
    },
    [fetchSuggestion, title, titleTouched],
  )

  const uploadThumbnail = async (file: File) => {
    setUploadingThumb(true)
    setError(null)

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `embeds/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('embed-thumbnails')
      .upload(filePath, file, { upsert: false })

    if (uploadError) {
      setUploadingThumb(false)
      setError(`Thumbnail upload failed: ${uploadError.message}`)
      return
    }

    const { data } = supabase.storage.from('embed-thumbnails').getPublicUrl(filePath)
    setSuggestedThumbnail(data.publicUrl)
    setUploadingThumb(false)
  }

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setUrl('')
    setSuggestedTitle(null)
    setSuggestedThumbnail(null)
    setSelectedFileName('Choose the files to upload')
    setSuggestionError(null)
    setTitleTouched(false)
    setShowForm(false)
  }

  const sortedRows = useMemo(() => [...rows].sort((a, b) => a.sort_order - b.sort_order), [rows])

  const addRow = async () => {
    if (!url.trim()) return
    setSaving(true)
    setError(null)

    const finalTitle = title.trim() || suggestedTitle?.trim() || deriveTitleFromUrl(url)
    const maxSort = rows.length > 0 ? Math.max(...rows.map((row) => row.sort_order)) : -1
    const { error: insertError } = await supabase.from('embeds').insert({
      title: finalTitle,
      url: url.trim(),
      thumbnail_url: suggestedThumbnail || null,
      sort_order: maxSort + 1,
      is_active: true,
    })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    resetForm()
    setSaving(false)
    await loadEmbeds()
  }

  const startEdit = (row: EmbedRow) => {
    setEditingId(row.id)
    setShowForm(true)
    setTitle(row.title)
    setUrl(row.url)
    setSuggestedTitle(row.title)
    setSuggestedThumbnail(row.thumbnail_url ?? null)
    setSelectedFileName(row.thumbnail_url ? 'Current thumbnail' : 'Choose the files to upload')
    setSuggestionError(null)
    setTitleTouched(true)
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const saveEdit = async () => {
    if (!editingId || !title.trim() || !url.trim()) return
    setSaving(true)
    setError(null)
    const existingRow = rows.find((item) => item.id === editingId)
    let nextThumb = existingRow?.thumbnail_url ?? null
    const trimmedUrl = url.trim()

    if (trimmedUrl && trimmedUrl !== (existingRow?.url ?? '')) {
      const suggestion = await fetchSuggestion(trimmedUrl)
      if (suggestion.thumbnail) nextThumb = suggestion.thumbnail
    }
    if (suggestedThumbnail) {
      nextThumb = suggestedThumbnail
    }

    const { error: updateError } = await supabase
      .from('embeds')
      .update({
        title: title.trim(),
        url: trimmedUrl,
        thumbnail_url: nextThumb,
      })
      .eq('id', editingId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    resetForm()
    await loadEmbeds()
  }

  const toggleActive = async (row: EmbedRow) => {
    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('embeds')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await loadEmbeds()
  }

  const deleteRow = async (id: string) => {
    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase.from('embeds').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      setSaving(false)
      return
    }
    setSaving(false)
    await loadEmbeds()
  }

  const persistSortOrder = useCallback(async (ordered: EmbedRow[]) => {
    const updates = ordered.map((item, index) =>
      supabase.from('embeds').update({ sort_order: index }).eq('id', item.id),
    )
    const results = await Promise.all(updates)
    const failed = results.find((result) => result.error)
    if (failed?.error) {
      setError(failed.error.message)
      await loadEmbeds()
      return false
    }
    return true
  }, [loadEmbeds])

  const reorderRows = useCallback(
    async (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return
      const current = [...sortedRows]
      const fromIndex = current.findIndex((item) => item.id === sourceId)
      const toIndex = current.findIndex((item) => item.id === targetId)
      if (fromIndex < 0 || toIndex < 0) return

      const [moved] = current.splice(fromIndex, 1)
      current.splice(toIndex, 0, moved)
      const reordered = current.map((item, index) => ({ ...item, sort_order: index }))

      setRows(reordered)
      setSaving(true)
      setError(null)
      await persistSortOrder(reordered)
      setSaving(false)
    },
    [persistSortOrder, sortedRows],
  )

  const rangeMs = useMemo(() => {
    if (insightRange === 'custom') return 0
    if (insightRange === '6h') return 6 * 60 * 60 * 1000
    if (insightRange === '12h') return 12 * 60 * 60 * 1000
    if (insightRange === '1d') return 24 * 60 * 60 * 1000
    if (insightRange === '3d') return 3 * 24 * 60 * 60 * 1000
    if (insightRange === '7d') return 7 * 24 * 60 * 60 * 1000
    return 30 * 24 * 60 * 60 * 1000
  }, [insightRange])

  const rangeWindow = useMemo(() => {
    if (insightRange !== 'custom') {
      return { since: Date.now() - rangeMs, until: Date.now() }
    }

    const parsedFrom = new Date(customFrom).getTime()
    const parsedTo = new Date(customTo).getTime()
    const now = Date.now()
    const fallbackSince = now - 7 * 24 * 60 * 60 * 1000

    const since = Number.isFinite(parsedFrom) ? parsedFrom : fallbackSince
    const until = Number.isFinite(parsedTo) ? parsedTo : now
    return since <= until ? { since, until } : { since: until, until: since }
  }, [customFrom, customTo, insightRange, rangeMs])

  const filteredEvents = useMemo(
    () =>
      clickEvents.filter((event) => {
        const ts = new Date(event.clicked_at).getTime()
        return ts >= rangeWindow.since && ts <= rangeWindow.until
      }),
    [clickEvents, rangeWindow.since, rangeWindow.until],
  )

  const rangeSummary = useMemo(
    () => ({ totalClicks: filteredEvents.length }),
    [filteredEvents.length],
  )

  const perEmbedRangeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const row of sortedRows) counts[row.id] = 0
    for (const event of filteredEvents) {
      counts[event.embed_id] = (counts[event.embed_id] ?? 0) + 1
    }
    return counts
  }, [filteredEvents, sortedRows])

  const rangeDurationMs = rangeWindow.until - rangeWindow.since

  const dailySeries = useMemo(() => {
    const bucketMs = rangeDurationMs <= 48 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    const buckets = new Map<number, number>()
    const start = Math.floor(rangeWindow.since / bucketMs) * bucketMs
    const end = Math.floor(rangeWindow.until / bucketMs) * bucketMs

    for (let time = start; time <= end; time += bucketMs) {
      buckets.set(time, 0)
    }

    for (const event of filteredEvents) {
      const ts = new Date(event.clicked_at).getTime()
      const key = Math.floor(ts / bucketMs) * bucketMs
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1)
      }
    }

    return Array.from(buckets.entries()).map(([time, clicks]) => ({
      date: new Date(time).toISOString(),
      clicks,
      label:
        bucketMs === 60 * 60 * 1000
          ? new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    }))
  }, [filteredEvents, rangeDurationMs, rangeWindow.since, rangeWindow.until])

  const maxDailyClicks = Math.max(1, ...dailySeries.map((item) => item.clicks))

  return (
    <div className="stack-md">
      <div className="admin-heading-row">
        <div>
          <h2>Embeds</h2>
          <p className="muted">Manage links like Linktree and review insights separately</p>
        </div>
      </div>

      <div className="embed-admin-tabs">
        <button
          type="button"
          className={activeTab === 'links' ? 'embed-admin-tab active' : 'embed-admin-tab'}
          onClick={() => setActiveTab('links')}
        >
          Links
        </button>
        <button
          type="button"
          className={activeTab === 'insights' ? 'embed-admin-tab active' : 'embed-admin-tab'}
          onClick={() => setActiveTab('insights')}
        >
          Insights
        </button>
      </div>

      {error ? <p className="alert alert-error">{error}</p> : null}

      {activeTab === 'links' ? (
        <>
          <div className="button-row">
            <Button type="button" onClick={() => setShowForm((prev) => !prev)} className="add-btn">
              {showForm ? 'Close Form' : '+ Add Embed'}
            </Button>
          </div>

          {showForm ? (
            <div ref={formCardRef}>
              <Card className="admin-glass-card">
                <div className="inline-form embed-form-grid">
                  <Input
                    placeholder="Title (optional, can auto-suggest from link)"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value)
                      setTitleTouched(true)
                    }}
                  />
                  <Input
                    placeholder="URL"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onBlur={() => void applySuggestionFromUrl(url, true)}
                  />
                  {editingId ? (
                    <Button type="button" onClick={saveEdit} disabled={saving || uploadingThumb}>
                      {saving ? 'Updating...' : 'Update'}
                    </Button>
                  ) : (
                    <Button type="button" onClick={addRow} disabled={saving || uploadingThumb}>
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                </div>
                <div className="button-row">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void applySuggestionFromUrl(url, true)}
                    disabled={suggesting || saving}
                  >
                    {suggesting ? 'Suggesting...' : 'Auto Suggest Title/Thumbnail'}
                  </Button>
                  <label className="file-picker">
                    <span className="file-picker-label">{selectedFileName}</span>
                    <span className="file-picker-button">{uploadingThumb ? 'Uploading...' : 'Browse files'}</span>
                    <input
                      ref={thumbInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) {
                          setSelectedFileName(file.name)
                          void uploadThumbnail(file)
                        }
                      }}
                    />
                  </label>
                </div>
                {suggestionError ? <p className="alert alert-warning">{suggestionError}</p> : null}
                {suggestedTitle || suggestedThumbnail ? (
                  <div className="embed-suggest-card">
                    {suggestedThumbnail ? (
                      <img src={suggestedThumbnail} alt="Suggested thumbnail" className="embed-suggest-thumb" />
                    ) : (
                      <div className="embed-suggest-thumb embed-suggest-fallback">No thumbnail</div>
                    )}
                    <div className="stack-xs">
                      <strong>{suggestedTitle ?? deriveTitleFromUrl(url)}</strong>
                      <span className="muted">Preview from link metadata</span>
                      <div className="button-row">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            if (suggestedTitle) {
                              setTitle(suggestedTitle)
                              setTitleTouched(true)
                            }
                          }}
                          disabled={!suggestedTitle}
                        >
                          Use Suggested Title
                        </Button>
                        {editingId ? (
                          <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                            Cancel Edit
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
          ) : null}

          <div className="stack-sm">
            {loading ? <p className="muted">Loading embeds...</p> : null}
            {!loading && sortedRows.length === 0 ? <p className="muted">No embeds yet.</p> : null}
            {!loading
              ? sortedRows.map((row, index) => (
                  <div
                    className={`admin-link-card-wrap ${dragOverId === row.id ? 'drag-over' : ''}`}
                    key={row.id}
                    draggable={!saving}
                    onDragStart={() => {
                      setDraggedId(row.id)
                      setDragOverId(null)
                    }}
                    onDragOver={(event: DragEvent<HTMLDivElement>) => {
                      event.preventDefault()
                      if (dragOverId !== row.id) setDragOverId(row.id)
                    }}
                    onDragLeave={() => {
                      if (dragOverId === row.id) setDragOverId(null)
                    }}
                    onDrop={async (event: DragEvent<HTMLDivElement>) => {
                      event.preventDefault()
                      const sourceId = draggedId
                      setDragOverId(null)
                      setDraggedId(null)
                      if (!sourceId) return
                      await reorderRows(sourceId, row.id)
                    }}
                    onDragEnd={() => {
                      setDragOverId(null)
                      setDraggedId(null)
                    }}
                  >
                    <Card className="admin-glass-card admin-link-card">
                    <div className="admin-link-card-top">
                      <div className="order-cell">
                        <span className="drag-handle" title="Drag to reorder">:::</span>
                        <span className="order-pill">{index + 1}</span>
                      </div>
                      <div className="admin-link-main">
                        <strong className="admin-embed-label-text">{row.title}</strong>
                        <span className="admin-embed-url-text">{row.url}</span>
                      </div>
                      <div className="admin-link-stats">
                        <span className="muted insight-click-chip">
                          <span className="insight-mini-icon" aria-hidden>+</span>{' '}
                          {(perEmbedRangeCounts[row.id] ?? 0).toLocaleString()} clicks
                        </span>
                      </div>
                    </div>
                    <div className="admin-link-card-bottom">
                      <div className="admin-link-actions">
                        <button
                          type="button"
                          className={`switch ${row.is_active ? 'on' : ''}`}
                          onClick={() => toggleActive(row)}
                          disabled={saving}
                          aria-label={`Toggle active for ${row.title}`}
                        >
                          <span />
                        </button>
                        <div className="icon-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => startEdit(row)}
                            disabled={saving}
                          >
                            <PencilIcon width={16} height={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => deleteRow(row.id)}
                            disabled={saving}
                          >
                            <TrashIcon width={16} height={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                    </Card>
                  </div>
                ))
              : null}
          </div>
        </>
      ) : (
        <>
          <Card className="admin-glass-card">
            <div className="row-space">
              <h3>Insights</h3>
              <span className="muted">{analyticsLoading ? 'Refreshing...' : 'Click analytics'}</span>
            </div>
            <div className="button-row">
              <select
                className="select public-select"
                value={insightRange}
                onChange={(event) =>
                  setInsightRange(event.target.value as '6h' | '12h' | '1d' | '3d' | '7d' | '30d' | 'custom')
                }
              >
                <option value="6h">Last 6 hours</option>
                <option value="12h">Last 12 hours</option>
                <option value="1d">Last 1 day</option>
                <option value="3d">Last 3 days</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom range</option>
              </select>
            </div>
            {insightRange === 'custom' ? (
              <div className="button-row custom-range-row">
                <label className="stack-xs">
                  <span className="muted">From</span>
                  <input
                    type="datetime-local"
                    className="input"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </label>
                <label className="stack-xs">
                  <span className="muted">To</span>
                  <input
                    type="datetime-local"
                    className="input"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <div className="admin-embed-summary-grid">
              <div className="public-metric-card">
                <p className="public-metric-value">{rangeSummary.totalClicks.toLocaleString()}</p>
                <p className="public-metric-label">Insights +</p>
              </div>
              <div className="public-metric-card">
                <p className="public-metric-value">{sortedRows.length.toLocaleString()}</p>
                <p className="public-metric-label">Links</p>
              </div>
              <div className="public-metric-card">
                <p className="public-metric-value">{dailySeries.length.toLocaleString()}</p>
                <p className="public-metric-label">Days</p>
              </div>
              <div className="public-metric-card">
                <p className="public-metric-value">{maxDailyClicks.toLocaleString()}</p>
                <p className="public-metric-label">Peak/day</p>
              </div>
            </div>

            <div className="embed-insight-chart-scroll">
              <div className="embed-insight-chart">
                {dailySeries.map((item) => (
                  <div key={item.date} className="embed-insight-bar-item">
                    <div className="embed-insight-bar-wrap">
                      <div
                        className="embed-insight-bar"
                        style={{ height: `${Math.max(6, (item.clicks / maxDailyClicks) * 100)}%` }}
                        title={`${item.label}: ${item.clicks} clicks`}
                      />
                    </div>
                    <span className="embed-insight-bar-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="admin-glass-card">
            <h3>Per Link Summary</h3>
            <div className="table-wrap">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="muted">
                        No embeds to analyze yet.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row) => (
                      <tr key={`analytics-${row.id}`}>
                        <td>{row.title}</td>
                        <td>
                          <span className="insight-click-chip">
                            <span className="insight-mini-icon" aria-hidden>+</span>{' '}
                            {(perEmbedRangeCounts[row.id] ?? 0).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

export default EmbedsManager
