import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Badge, Card, List } from "antd-mobile"

const demoGroups = [
  {
    title: "React basics",
    description: "Small interactive examples for state, events, and component structure.",
    demos: [{ to: "/demos/counter", label: "Counter demo", status: "Ready" }],
  },
  {
    title: "Graphics",
    description: "GPU-rendered visual demos with interactive rendering controls.",
    demos: [
      { to: "/demos/fractal", label: "Fractal shader", status: "New" },
      { to: "/demos/ray-tracing", label: "Ray tracing demo", status: "Ready" },
    ],
  },
  {
    title: "Network play",
    description: "Peer-to-peer demos for browser networking, shared state, and mobile controls.",
    demos: [{ to: "/demos/peer-maze", label: "Peer maze co-op", status: "New" }],
  },
] as const

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()

  return (
    <section className="page-stack">
      <header className="page-header">
        <p className="eyebrow">Demo index</p>
        <h2>One place to collect learning demos</h2>
        <p>
          Add focused examples as route files under <code>src/routes</code>. The sidebar and
          generated route tree make each demo easy to find while keeping the app lightweight.
        </p>
      </header>

      <div className="demo-grid">
        {demoGroups.map((group) => (
          <Card className="demo-card" key={group.title} title={group.title}>
            <p>{group.description}</p>
            <List>
              {group.demos.map((demo) => (
                <List.Item
                  arrowIcon
                  clickable
                  extra={<Badge content={demo.status} color="#2563eb" />}
                  key={demo.to}
                  onClick={() => navigate({ to: demo.to })}
                >
                  {demo.label}
                </List.Item>
              ))}
            </List>
          </Card>
        ))}
      </div>
    </section>
  )
}
