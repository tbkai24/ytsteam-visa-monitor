import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type EmbedItem = {
  id: string
  title: string
  url: string
  thumbnail_url?: string | null
  is_active: boolean
  sort_order: number
}

type EmbedPageSettings = {
  embeds_title?: string | null
  embeds_subtitle?: string | null
}

function Embeds() {
  const [rows, setRows] = useState<EmbedItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pageTitle, setPageTitle] = useState('Embeds')
  const [pageSubtitle, setPageSubtitle] = useState('Watch and support SB19')

  useEffect(() => {
    const load = async () => {
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('embeds_title,embeds_subtitle')
        .eq('id', 1)
        .maybeSingle()

      if (settingsData) {
        const settings = settingsData as EmbedPageSettings
        setPageTitle((settings.embeds_title ?? 'Embeds').trim() || 'Embeds')
        setPageSubtitle((settings.embeds_subtitle ?? 'Watch and support SB19').trim() || 'Watch and support SB19')
      }

      const { data, error: fetchError } = await supabase
        .from('embeds')
        .select('id,title,url,thumbnail_url,is_active,sort_order')
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

  const trackEmbedClick = async (embedId: string) => {
    await supabase.from('embed_click_events').insert({
      embed_id: embedId,
      clicked_at: new Date().toISOString(),
    })
  }

  return (
    <div className="public-stack">
      <section className="public-hero public-hero-small">
        <h1>{pageTitle}</h1>
        <p>{pageSubtitle}</p>
        {error ? <p className="alert alert-error">{error}</p> : null}
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
            onClick={() => {
              void trackEmbedClick(item.id)
            }}
          >
            {item.thumbnail_url ? (
              <img src={item.thumbnail_url} alt={item.title} className="public-embed-thumb-img" />
            ) : (
              <div className="public-embed-thumb">{index === 0 ? '500K' : 'IMG'}</div>
            )}
            <div className="public-embed-main">
              <h3 className="public-embed-title">{item.title}</h3>
              <span className="public-embed-link">{item.url}</span>
            </div>
          </a>
        ))}
      </section>
    </div>
  )
}

export default Embeds
