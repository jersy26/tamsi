import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Home } from './Home.tsx'
import { Ofw } from './Ofw.tsx'
import { PayCancel, PaySuccess } from './Pay.tsx'
import { Pos } from './Pos.tsx'
import './styles.css'

// Plain links between a handful of pages: a full page load is fine, so no router.
function Page() {
  if (window.location.pathname === '/pos') return <Pos />
  if (window.location.pathname === '/ofw') return <Ofw />
  if (window.location.pathname === '/pay/success') return <PaySuccess />
  if (window.location.pathname === '/pay/cancel') return <PayCancel />
  return <Home />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
