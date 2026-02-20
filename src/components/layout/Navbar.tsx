import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const links = [
  { to: '/', label: 'Homepage' },
  { to: '/milestones', label: 'Milestones' },
  { to: '/embeds', label: 'Embeds' },
]

function Navbar() {
  const [websiteName, setWebsiteName] = useState('TEAM9')
  const [logoUrl, setLogoUrl] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const loadBrand = async () => {
      const { data } = await supabase.from('app_settings').select('website_name,logo_url').eq('id', 1).maybeSingle()
      if (data) {
        setWebsiteName(((data as { website_name?: string }).website_name ?? 'TEAM9').trim() || 'TEAM9')
        setLogoUrl(((data as { logo_url?: string }).logo_url ?? '').trim())
      }
    }
    void loadBrand()
  }, [])

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <div className="public-brand-wrap">
          {logoUrl ? (
            <img src={logoUrl} alt={`${websiteName} logo`} className="public-logo" />
          ) : (
            <span className="public-brand-mark">o</span>
          )}
          <div className={logoUrl ? 'brand brand-compact' : 'brand'}>{websiteName}</div>
        </div>
        <button
          type="button"
          className="navbar-menu-btn"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
        <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              end={link.to === '/'}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

export default Navbar
