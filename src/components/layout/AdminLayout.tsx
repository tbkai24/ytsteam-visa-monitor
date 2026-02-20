import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import Button from '../ui/Button'
import {
  ChartIcon,
  CodeIcon,
  FacebookIcon,
  GearIcon,
  InstagramIcon,
  ListIcon,
  XBrandIcon,
} from '../ui/Icons'

const adminLinks = [
  { to: '/admin/milestones', label: 'Milestones', icon: ListIcon },
  { to: '/admin/embeds', label: 'Embeds', icon: CodeIcon },
  { to: '/admin/views-monitoring', label: 'Monitoring', icon: ChartIcon },
  { to: '/admin/settings', label: 'Settings', icon: GearIcon },
]

function AdminLayout() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [websiteName, setWebsiteName] = useState('TEAM9')
  const [footerText, setFooterText] = useState('')
  const [xUrl, setXUrl] = useState('#')
  const [facebookUrl, setFacebookUrl] = useState('#')
  const [instagramUrl, setInstagramUrl] = useState('#')
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
        const nextName = (row.website_name ?? '').trim()
        if (nextName) setWebsiteName(nextName)
        setFooterText((row.footer_text ?? '').trim())
        setXUrl((row.x_url ?? '#').trim() || '#')
        setFacebookUrl((row.facebook_url ?? '#').trim() || '#')
        setInstagramUrl((row.instagram_url ?? '#').trim() || '#')
      }
    }
    void loadBrand()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login', { replace: true })
  }

  const displayFooter = footerText.trim() || `© ${new Date().getFullYear()} ${websiteName}. All rights reserved.`

  return (
    <div className="admin-page">
      <div className="admin-shell">
        <aside className={sidebarOpen ? 'admin-sidebar open' : 'admin-sidebar'}>
          <div className="admin-brand-wrap">
            <div className="admin-brand">{websiteName}</div>
            <p className="admin-brand-sub">Admin Panel</p>
          </div>
          <nav className="admin-nav">
            {adminLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? 'admin-link active' : 'admin-link')}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="admin-link-icon">
                  <link.icon width={18} height={18} />
                </span>
                <span className="admin-link-text">{link.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="admin-user-box">
            <p className="admin-user-email">{session?.user.email ?? 'admin@email.com'}</p>
            <Button type="button" variant="ghost" onClick={handleLogout} className="logout-btn">
              Logout
            </Button>
          </div>
        </aside>
        <button
          type="button"
          className={sidebarOpen ? 'admin-sidebar-backdrop open' : 'admin-sidebar-backdrop'}
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />

        <section className="admin-main">
          <header className="admin-topbar">
            <button
              type="button"
              className="admin-mobile-toggle"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle admin menu"
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? 'x Close' : '☰ Menu'}
            </button>
            <div className="admin-topbar-right">Menu</div>
          </header>
          <div className="admin-content">
            <Outlet />
          </div>
        </section>
      </div>

      <footer className="admin-footer">
        <p>{displayFooter}</p>
        <div className="social-icons">
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
      </footer>
    </div>
  )
}

export default AdminLayout
