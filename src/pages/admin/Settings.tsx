import { useCallback, useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

type AppSettingsRow = {
  id: number
  hero_title?: string | null
  hero_subtitle?: string | null
  website_name?: string | null
  logo_url?: string | null
  footer_text?: string | null
  x_url?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
}

function Settings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [heroTitle, setHeroTitle] = useState('')
  const [heroSubtitle, setHeroSubtitle] = useState('')
  const [websiteName, setWebsiteName] = useState('TEAM9')
  const [logoUrl, setLogoUrl] = useState('')
  const [footerText, setFooterText] = useState('')
  const [xUrl, setXUrl] = useState('')
  const [facebookUrl, setFacebookUrl] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotice(null)

    const { data, error: fetchError } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    if (data) {
      const row = data as AppSettingsRow
      setHeroTitle((row.hero_title ?? '').trim())
      setHeroSubtitle((row.hero_subtitle ?? '').trim())
      setWebsiteName((row.website_name ?? 'TEAM9').trim())
      setLogoUrl((row.logo_url ?? '').trim())
      setFooterText((row.footer_text ?? '').trim())
      setXUrl((row.x_url ?? '').trim())
      setFacebookUrl((row.facebook_url ?? '').trim())
      setInstagramUrl((row.instagram_url ?? '').trim())
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)

    const payload = {
      id: 1,
      hero_title: heroTitle.trim() || null,
      hero_subtitle: heroSubtitle.trim() || null,
      website_name: websiteName.trim() || 'TEAM9',
      logo_url: logoUrl.trim() || null,
      footer_text: footerText.trim() || null,
      x_url: xUrl.trim() || null,
      facebook_url: facebookUrl.trim() || null,
      instagram_url: instagramUrl.trim() || null,
    }

    const { error: upsertError } = await supabase.from('app_settings').upsert(payload, { onConflict: 'id' })

    if (upsertError) {
      if (
        upsertError.message.includes('website_name') ||
        upsertError.message.includes('logo_url') ||
        upsertError.message.includes('footer_text') ||
        upsertError.message.includes('x_url') ||
        upsertError.message.includes('facebook_url') ||
        upsertError.message.includes('instagram_url')
      ) {
        setError(
          'Missing app_settings columns. Add website_name, logo_url, footer_text, x_url, facebook_url, instagram_url, then save again.',
        )
      } else {
        setError(upsertError.message)
      }
      setSaving(false)
      return
    }

    setNotice('Settings saved.')
    setSaving(false)
  }

  return (
    <div className="stack-md">
      <div className="admin-heading-row">
        <div>
          <h2>Settings</h2>
          <p className="muted">Control website name, logo, and homepage hero text</p>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      <Card className="admin-glass-card settings-card">
        {loading ? <p className="muted">Loading settings...</p> : null}
        {!loading ? (
          <div className="stack-sm">
            <label className="stack-xs">
              <span className="muted">Website Name</span>
              <Input value={websiteName} onChange={(event) => setWebsiteName(event.target.value)} />
            </label>
            <label className="stack-xs">
              <span className="muted">Logo URL (optional)</span>
              <Input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} />
            </label>
            <label className="stack-xs">
              <span className="muted">Hero Title (optional)</span>
              <Input value={heroTitle} onChange={(event) => setHeroTitle(event.target.value)} />
            </label>
            <label className="stack-xs">
              <span className="muted">Hero Subtitle (optional)</span>
              <Input value={heroSubtitle} onChange={(event) => setHeroSubtitle(event.target.value)} />
            </label>
            <hr className="admin-divider" />
            <label className="stack-xs">
              <span className="muted">Footer Text (optional)</span>
              <Input
                value={footerText}
                onChange={(event) => setFooterText(event.target.value)}
                placeholder="e.g. © 2026 TEAM9. All rights reserved."
              />
            </label>
            <label className="stack-xs">
              <span className="muted">X URL (optional)</span>
              <Input
                value={xUrl}
                onChange={(event) => setXUrl(event.target.value)}
                placeholder="https://x.com/yourhandle"
              />
            </label>
            <label className="stack-xs">
              <span className="muted">Facebook URL (optional)</span>
              <Input
                value={facebookUrl}
                onChange={(event) => setFacebookUrl(event.target.value)}
                placeholder="https://facebook.com/yourpage"
              />
            </label>
            <label className="stack-xs">
              <span className="muted">Instagram URL (optional)</span>
              <Input
                value={instagramUrl}
                onChange={(event) => setInstagramUrl(event.target.value)}
                placeholder="https://instagram.com/yourhandle"
              />
            </label>
            <div className="button-row">
              <Button type="button" onClick={saveSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}

export default Settings
