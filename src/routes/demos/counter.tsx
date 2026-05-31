import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, Space } from "antd-mobile"
import { useState } from "react"

export const Route = createFileRoute("/demos/counter")({
  component: CounterDemo,
})

function CounterDemo() {
  const [count, setCount] = useState(0)
  const isEven = count % 2 === 0

  return (
    <section className="page-stack">
      <header className="page-header">
        <p className="eyebrow">React basics</p>
        <h2>Counter demo</h2>
        <p>A compact route-backed demo for local component state and event handlers.</p>
      </header>

      <Card className="counter-panel">
        <p className="counter-value">{count}</p>
        <p className="counter-state">{isEven ? "Even value" : "Odd value"}</p>
        <Space block justify="center" wrap>
          <Button color="primary" fill="outline" onClick={() => setCount((value) => value - 1)}>
            Decrement
          </Button>
          <Button onClick={() => setCount(0)}>Reset</Button>
          <Button color="primary" onClick={() => setCount((value) => value + 1)}>
            Increment
          </Button>
        </Space>
        <div className="mobile-actions">
          <Button
            block
            color="primary"
            fill="outline"
            onClick={() => setCount((value) => value - 1)}
          >
            Decrement
          </Button>
          <Button block onClick={() => setCount(0)}>
            Reset
          </Button>
          <Button block color="primary" onClick={() => setCount((value) => value + 1)}>
            Increment
          </Button>
        </div>
      </Card>
    </section>
  )
}
