import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { FacebookIcon, InstagramIcon, XBrandIcon } from '../ui/Icons'

function Footer() {
  const [websiteName, setWebsiteName] = useState('ytsteam-visa-monitor')
  const [footerText, setFooterText] = useState('')
  const [xUrl, setXUrl] = useState('#')
  const [facebookUrl, setFacebookUrl] = useState('#')
  const [instagramUrl, setInstagramUrl] = useState('#')

  useEffect(() => {
    const loadBrand = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('website_name, footer_text, x_url, facebook_url, instagram_url')
        .eq('id', 1)
        .maybeSingle()
      if (data) {
        const row = data as {
          website_name?: string
          footer_text?: string
          x_url?: string
          facebook_url?: string
          instagram_url?: string
        }
        setWebsiteName((row.website_name ?? 'ytsteam-visa-monitor').trim() || 'ytsteam-visa-monitor')
        setFooterText((row.footer_text ?? '').trim())
        setXUrl((row.x_url ?? '#').trim() || '#')
        setFacebookUrl((row.facebook_url ?? '#').trim() || '#')
        setInstagramUrl((row.instagram_url ?? '#').trim() || '#')
      }
    }
    void loadBrand()
  }, [])

  const displayFooter = footerText.trim() || `© ${new Date().getFullYear()} ${websiteName}. All rights reserved.`

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <p>{displayFooter}</p>
        <div className="social-icons" aria-label="Social links">
          <a href={xUrl} aria-label="X" target="_blank" rel="noreferrer">
            <XBrandIcon width={16} height={16} />
          </a>
          <a href={facebookUrl} aria-label="Facebook" target="_blank" rel="noreferrer">
            <FacebookIcon width={16} height={16} />
          </a>
          <a href={instagramUrl} aria-label="Instagram" target="_blank" rel="noreferrer">
            <InstagramIcon width={16} height={16} />
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer
