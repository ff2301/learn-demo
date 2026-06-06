import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { Popup } from "antd-mobile"
import { useState } from "react"

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/demos/counter", label: "Counter demo" },
  { to: "/demos/fractal", label: "Fractal shader" },
  { to: "/demos/hourglass", label: "Sensor hourglass" },
  { to: "/demos/peer-maze", label: "Peer maze co-op" },
  { to: "/demos/ray-tracing", label: "Ray tracing demo" },
  { to: "/demos/rotor-router", label: "Rotor-router field" },
] as const

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button
          aria-label="Open demo navigation"
          className="menu-button"
          onClick={() => setDrawerOpen(true)}
          type="button"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <div className="mobile-title">
          <span className="brand-mark">LD</span>
          <span>Demo Lab</span>
        </div>
      </header>

      <aside className="sidebar desktop-sidebar" aria-label="Demo navigation">
        <Brand />
        <DemoNav />
      </aside>

      <Popup
        bodyClassName="drawer-panel"
        closeOnMaskClick
        onClose={() => setDrawerOpen(false)}
        position="left"
        visible={drawerOpen}
      >
        <div className="drawer-content">
          <Brand />
          <DemoNav onNavigate={() => setDrawerOpen(false)} />
        </div>
      </Popup>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">LD</span>
      <div>
        <p className="eyebrow">learn-demo</p>
        <h1>Demo Lab</h1>
      </div>
    </div>
  )
}

function DemoNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav>
      {navItems.map((item) => (
        <Link
          activeProps={{ className: "nav-link active" }}
          className="nav-link"
          key={item.to}
          onClick={onNavigate}
          to={item.to}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
