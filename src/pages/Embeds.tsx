import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type EmbedItem = {
  id: string
  label: string
  url: string
  thumbnail_url?: string | null
  embed_enabled: boolean
  is_active: boolean
  sort_order: number
}

const deriveFallbackPreview = (url: string) => {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./i, '')
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')
    return path ? `${host}${path}` : host
  } catch {
    return 'Open link for preview details.'
  }
}

const fetchLinkPreview = async (url: string): Promise<string> => {
  const encoded = encodeURIComponent(url)

  try {
    const micro = await fetch(`https://api.microlink.io/?url=${encoded}`)
    if (micro.ok) {
      const payload = (await micro.json()) as {
        data?: { description?: string; title?: string }
      }
      const desc = payload.data?.description?.trim()
      if (desc) return desc
      const title = payload.data?.title?.trim()
      if (title) return title
    }
  } catch {
    // continue to fallback providers
  }

  try {
    const noembed = await fetch(`https://noembed.com/embed?url=${encoded}`)
    if (noembed.ok) {
      const payload = (await noembed.json()) as {
        title?: string
        author_name?: string
        provider_name?: string
      }
      const pieces = [payload.title, payload.author_name, payload.provider_name]
        .map((value) => value?.trim())
        .filter(Boolean)
      if (pieces.length > 0) return pieces.join(' • ')
    }
  } catch {
    // use final fallback
  }

  return deriveFallbackPreview(url)
}

function Embeds() {
  const [rows, setRows] = useState<EmbedItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('embeds')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        return
      }

      setRows((data ?? []) as EmbedItem[])
    }

    void load()
  }, [])

  useEffect(() => {
    if (rows.length === 0) {
      setPreviews({})
      return
    }

    let isCancelled = false

    const loadPreviews = async () => {
      const pairs = await Promise.all(
        rows.map(async (item) => [item.id, await fetchLinkPreview(item.url)] as const),
      )

      if (!isCancelled) {
        setPreviews(Object.fromEntries(pairs))
      }
    }

    void loadPreviews()
    return () => {
      isCancelled = true
    }
  }, [rows])

  return (
    <div className="public-stack">
      <section className="public-hero public-hero-small">
        <h1>Embeds</h1>
        <p>Watch and support SB19</p>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="public-stack">
        {rows.length === 0 ? <p className="muted">No embeds available.</p> : null}
        {rows.map((item, index) => (
          <a
            className="public-embed-card public-embed-card-link"
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            {item.thumbnail_url ? (
              <img src={item.thumbnail_url} alt={item.label} className="public-embed-thumb-img" />
            ) : (
              <div className="public-embed-thumb">{index === 0 ? '500K' : 'IMG'}</div>
            )}
            <div className="public-embed-main">
              <h3 className="public-embed-title">{item.label}</h3>
              <p className="muted public-embed-desc">{previews[item.id] ?? deriveFallbackPreview(item.url)}</p>
              <span className="public-embed-link">{item.url}</span>
            </div>
          </a>
        ))}
      </section>
    </div>
  )
}

export default Embeds
