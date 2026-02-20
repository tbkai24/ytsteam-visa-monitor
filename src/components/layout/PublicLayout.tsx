import { Outlet } from 'react-router-dom'
import Footer from './Footer'
import Navbar from './Navbar'

function PublicLayout() {
  return (
    <div className="site-shell public-shell-bg">
      <div className="container public-frame">
        <Navbar />
        <main className="page-content public-content">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}

export default PublicLayout
