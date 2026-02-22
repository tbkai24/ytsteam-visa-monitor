import { Navigate, createBrowserRouter } from 'react-router-dom'
import PublicLayout from './components/layout/PublicLayout'
import AdminLayout from './components/layout/AdminLayout'
import { RequireAdmin } from './lib/auth'
import Embeds from './pages/Embeds'
import Home from './pages/Home'
import Milestones from './pages/Milestones'
import Trending from './pages/Trending'
import AdminLogin from './pages/admin/AdminLogin'
import EmbedsManager from './pages/admin/EmbedsManager'
import MilestonesManager from './pages/admin/MilestonesManager'
import Settings from './pages/admin/Settings'
import ViewsMonitoring from './pages/admin/ViewsMonitoring'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'trending', element: <Trending /> },
      { path: 'milestones', element: <Milestones /> },
      { path: 'embeds', element: <Embeds /> },
    ],
  },
  {
    path: '/admin/login',
    element: <AdminLogin />,
  },
  {
    path: '/admin',
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/milestones" replace /> },
      { path: 'milestones', element: <MilestonesManager /> },
      { path: 'embeds', element: <EmbedsManager /> },
      { path: 'views-monitoring', element: <ViewsMonitoring /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
