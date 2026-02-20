import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { CheckIcon, PencilIcon, TrashIcon, XIcon } from '../../components/ui/Icons'
import Input from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

type EmbedRow = {
  id: string
  label: string
  url: string
  thumbnail_url?: string | null
  sort_order: number
  embed_enabled: boolean
  is_active: boolean
}

type LinkSuggestion = {
  title: string | null
  thumbnail: string | null
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null)
  const [suggestedThumbnail, setSuggestedThumbnail] = useState<string | null>(null)
  const [labelTouched, setLabelTouched] = useState(false)

  const loadEmbeds = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('embeds')
      .select('*')
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

  const fetchSuggestion = useCallback(async (sourceUrl: string): Promise<LinkSuggestion> => {
    const encoded = encodeURIComponent(sourceUrl)

    try {
      const micro = await fetch(`https://api.microlink.io/?url=${encoded}`)
      if (micro.ok) {
        const payload = (await micro.json()) as {
          data?: { title?: string; image?: { url?: string }; logo?: { url?: string } }
        }
        return {
          title: payload.data?.title ?? null,
          thumbnail: payload.data?.image?.url ?? payload.data?.logo?.url ?? null,
        }
      }
    } catch {
      // fallback below
    }

    try {
      const noembed = await fetch(`https://noembed.com/embed?url=${encoded}`)
      if (noembed.ok) {
        const payload = (await noembed.json()) as { title?: string; thumbnail_url?: string }
        return {
          title: payload.title ?? null,
          thumbnail: payload.thumbnail_url ?? null,
        }
      }
    } catch {
      // fallback below
    }

    return { title: null, thumbnail: null }
  }, [])

  const applySuggestionFromUrl = useCallback(
    async (sourceUrl: string, autoFillLabel = false) => {
      if (!isHttpUrl(sourceUrl)) {
        if (!autoFillLabel) {
          setSuggestionError('Enter a valid link (http/https) first.')
        }
        return
      }

      setSuggesting(true)
      setSuggestionError(null)

      const suggestion = await fetchSuggestion(sourceUrl)
      const fallbackTitle = deriveTitleFromUrl(sourceUrl)
      const finalTitle = suggestion.title?.trim() || fallbackTitle

      setSuggestedTitle(finalTitle)
      setSuggestedThumbnail(suggestion.thumbnail ?? null)
      if (autoFillLabel && !labelTouched && !label.trim()) {
        setLabel(finalTitle)
      }

      setSuggesting(false)
    },
    [fetchSuggestion, label, labelTouched],
  )

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  )

  const addRow = async () => {
    if (!url.trim()) return
    setSaving(true)
    setError(null)

    const finalLabel = label.trim() || suggestedTitle?.trim() || deriveTitleFromUrl(url)
    const maxSort = rows.length > 0 ? Math.max(...rows.map((row) => row.sort_order)) : -1
    const { error: insertError } = await supabase.from('embeds').insert({
      label: finalLabel,
      url: url.trim(),
      thumbnail_url: suggestedThumbnail || null,
      sort_order: maxSort + 1,
      embed_enabled: true,
      is_active: true,
    })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setLabel('')
    setUrl('')
    setSuggestedTitle(null)
    setSuggestedThumbnail(null)
    setSuggestionError(null)
    setLabelTouched(false)
    setShowForm(false)
    setSaving(false)
    await loadEmbeds()
  }

  const startEdit = (row: EmbedRow) => {
    setEditingId(row.id)
    setEditLabel(row.label)
    setEditUrl(row.url)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditLabel('')
    setEditUrl('')
  }

  const saveEdit = async () => {
    if (!editingId || !editLabel.trim() || !editUrl.trim()) return
    setSaving(true)
    setError(null)
    const existingRow = rows.find((item) => item.id === editingId)
    let nextThumb = existingRow?.thumbnail_url ?? null
    const trimmedUrl = editUrl.trim()

    if (trimmedUrl && trimmedUrl !== (existingRow?.url ?? '')) {
      const suggestion = await fetchSuggestion(trimmedUrl)
      if (suggestion.thumbnail) nextThumb = suggestion.thumbnail
    }

    const { error: updateError } = await supabase
      .from('embeds')
      .update({
        label: editLabel.trim(),
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
    cancelEdit()
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

  const toggleEmbed = async (row: EmbedRow) => {
    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('embeds')
      .update({ embed_enabled: !row.embed_enabled })
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

  return (
    <div className="stack-md">
      <div className="admin-heading-row">
        <div>
          <h2>Embeds</h2>
          <p className="muted">Manage external links and embed visibility</p>
        </div>
        <Button type="button" onClick={() => setShowForm((prev) => !prev)} className="add-btn">
          + Add Embed
        </Button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {showForm ? (
        <Card className="admin-glass-card">
          <div className="inline-form embed-form-grid">
            <Input
              placeholder="Label (optional, can auto-suggest from link)"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value)
                setLabelTouched(true)
              }}
            />
            <Input
              placeholder="URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => void applySuggestionFromUrl(url, true)}
            />
            <Button type="button" onClick={addRow} disabled={saving}>
              Save
            </Button>
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
          </div>
          {suggestionError ? <p className="error-text">{suggestionError}</p> : null}
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
                        setLabel(suggestedTitle)
                        setLabelTouched(true)
                      }
                    }}
                    disabled={!suggestedTitle}
                  >
                    Use Suggested Title
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setLabel('')
                      setLabelTouched(false)
                    }}
                  >
                    Clear Label
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="admin-glass-card">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Label</th>
              <th>URL</th>
              <th>Thumbnail</th>
              <th>Active</th>
              <th>Embed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="muted">
                  Loading embeds...
                </td>
              </tr>
            ) : null}
            {!loading && sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No embeds yet.
                </td>
              </tr>
            ) : null}
            {!loading
              ? sortedRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>
                      <div className="order-cell">
                        <span className="drag-handle">:::</span>
                        <span className="order-pill">{index + 1}</span>
                      </div>
                    </td>
                    <td>
                      {editingId === row.id ? (
                        <Input value={editLabel} onChange={(event) => setEditLabel(event.target.value)} />
                      ) : (
                        <strong>{row.label}</strong>
                      )}
                    </td>
                    <td>
                      {editingId === row.id ? (
                        <Input value={editUrl} onChange={(event) => setEditUrl(event.target.value)} />
                      ) : (
                        row.url
                      )}
                    </td>
                    <td>
                      {row.thumbnail_url ? (
                        <img src={row.thumbnail_url} alt={row.label} className="embed-suggest-thumb" />
                      ) : (
                        <span className="muted">No image</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`switch ${row.is_active ? 'on' : ''}`}
                        onClick={() => toggleActive(row)}
                        disabled={saving}
                        aria-label={`Toggle active for ${row.label}`}
                      >
                        <span />
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`switch ${row.embed_enabled ? 'on' : ''}`}
                        onClick={() => toggleEmbed(row)}
                        disabled={saving}
                        aria-label={`Toggle embed for ${row.label}`}
                      >
                        <span />
                      </button>
                    </td>
                    <td>
                      <div className="icon-actions">
                        {editingId === row.id ? (
                          <>
                            <button type="button" className="icon-btn" onClick={saveEdit} disabled={saving}>
                              <CheckIcon width={16} height={16} />
                            </button>
                            <button type="button" className="icon-btn" onClick={cancelEdit} disabled={saving}>
                              <XIcon width={16} height={16} />
                            </button>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export default EmbedsManager
