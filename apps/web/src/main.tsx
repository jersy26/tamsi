import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Home } from './Home.tsx'
import { Pos } from './Pos.tsx'
import './styles.css'

// Plain links between a handful of pages: a full page load is fine, so no router.
function Page() {
  if (window.location.pathname === '/pos') return <Pos />
  return <Home />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="testnet-banner">Testnet — demo money</div>
    <Page />
  </StrictMode>,
)
