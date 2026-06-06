import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, Slider, Space, Switch } from "antd-mobile"
import { useEffect, useRef, useState } from "react"

type SliderValue = number | [number, number]
type SensorState = "manual" | "active" | "blocked" | "unsupported"

type PermissionAwareEventConstructor = {
  requestPermission?: () => Promise<PermissionState>
}

type HourglassStats = {
  fps: number
  grains: number
  gravity: string
  lower: number
}

type Gravity = {
  x: number
  y: number
}

type SensorSample = {
  gravity: Gravity
  time: number
}

type Direction = {
  dx: number
  dy: number
}

type Sim = {
  allowed: Uint8Array
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  grains: Uint8Array
  height: number
  image: ImageData
  outline: Uint8Array
  shade: Uint8Array
  width: number
}

const simWidth = 184
const simHeight = 310
const centerY = Math.floor(simHeight / 2)
const topCap = 11
const bottomCap = simHeight - 12
const displayPaddingX = 24
const displayPaddingY = 58
const minimumProjectedGravity = 1.15
const statsUpdateInterval = 100
const neighborDirections: readonly Direction[] = [
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
]

export const Route = createFileRoute("/demos/hourglass")({
  component: HourglassDemo,
})

function HourglassDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sensorCleanupRef = useRef<(() => void) | null>(null)
  const sensorSampleRef = useRef<SensorSample | null>(null)
  const gravityTargetRef = useRef<Gravity>({ x: 0, y: 1 })
  const resetRequestRef = useRef(0)
  const settingsRef = useRef({
    angle: 0,
    fill: 78,
    paused: false,
    sensorActive: false,
    steps: 7,
  })

  const [angle, setAngle] = useState(0)
  const [fill, setFill] = useState(78)
  const [paused, setPaused] = useState(false)
  const [steps, setSteps] = useState(7)
  const [controlsOpen, setControlsOpen] = useState(() => window.innerWidth > 760)
  const [sensorState, setSensorState] = useState<SensorState>("manual")
  const [stats, setStats] = useState<HourglassStats>({
    fps: 0,
    grains: 0,
    gravity: "0.00, 1.00",
    lower: 0,
  })

  useEffect(() => {
    settingsRef.current = {
      angle,
      fill,
      paused,
      sensorActive: sensorState === "active",
      steps,
    }

    if (sensorState !== "active") {
      const radians = (angle / 180) * Math.PI
      gravityTargetRef.current = {
        x: Math.sin(radians),
        y: Math.cos(radians),
      }
    }
  }, [angle, fill, paused, sensorState, steps])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current

    if (!canvas || !container) {
      return
    }

    const context = canvas.getContext("2d", { alpha: false })

    if (!context) {
      return
    }

    const renderCanvas = canvas
    const renderContainer = container
    const renderContext = context
    const sim = createSim()
    seedSand(sim, settingsRef.current.fill)

    const gravity = { x: 0, y: 1 }
    let animationFrame = 0
    let disposed = false
    let frameCount = 0
    let lastFpsTime = performance.now()
    let lastTime = performance.now()
    let lastResetRequest = resetRequestRef.current
    let statsGrains = countGrains(sim.grains)

    function resetSand() {
      seedSand(sim, settingsRef.current.fill)
      statsGrains = countGrains(sim.grains)
    }

    function resizeCanvas() {
      const rect = renderContainer.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio, 2)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))

      if (renderCanvas.width !== width || renderCanvas.height !== height) {
        renderCanvas.width = width
        renderCanvas.height = height
      }

      renderContext.setTransform(dpr, 0, 0, dpr, 0, 0)
      renderContext.imageSmoothingEnabled = false
    }

    function render(now: number) {
      if (disposed) {
        return
      }

      resizeCanvas()

      if (resetRequestRef.current !== lastResetRequest) {
        lastResetRequest = resetRequestRef.current
        resetSand()
      }

      gravity.x += (gravityTargetRef.current.x - gravity.x) * 0.32
      gravity.y += (gravityTargetRef.current.y - gravity.y) * 0.32
      normalizeGravity(gravity)

      if (!settingsRef.current.paused) {
        for (let step = 0; step < settingsRef.current.steps; step += 1) {
          stepSand(sim, gravity, step + Math.floor(now))
        }
      }

      drawSim(renderContext, renderCanvas, sim, gravity)

      frameCount += 1

      if (now - lastFpsTime > statsUpdateInterval) {
        const fps = Math.round((frameCount * 1000) / Math.max(1, now - lastFpsTime))
        frameCount = 0
        lastFpsTime = now
        statsGrains = countGrains(sim.grains)
        setStats({
          fps,
          grains: statsGrains,
          gravity: `${gravity.x.toFixed(2)}, ${gravity.y.toFixed(2)}`,
          lower: getLowerFraction(sim, gravity),
        })
      }

      const elapsed = now - lastTime
      lastTime = now

      if (elapsed > 250) {
        settleOverload(sim)
      }

      animationFrame = requestAnimationFrame(render)
    }

    renderCanvas.addEventListener("dblclick", resetSand)
    render(performance.now())

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      renderCanvas.removeEventListener("dblclick", resetSand)
    }
  }, [])

  useEffect(() => {
    return () => {
      sensorCleanupRef.current?.()
    }
  }, [])

  async function enableSensors() {
    try {
      if (!("DeviceMotionEvent" in window) && !("DeviceOrientationEvent" in window)) {
        setSensorState("unsupported")
        return
      }

      const motionConstructor = (
        "DeviceMotionEvent" in window ? window.DeviceMotionEvent : undefined
      ) as PermissionAwareEventConstructor | undefined
      const orientationConstructor = (
        "DeviceOrientationEvent" in window ? window.DeviceOrientationEvent : undefined
      ) as PermissionAwareEventConstructor | undefined

      if (typeof motionConstructor?.requestPermission === "function") {
        const permission = await motionConstructor.requestPermission()

        if (permission !== "granted") {
          setSensorState("blocked")
          return
        }
      }

      if (!motionConstructor && typeof orientationConstructor?.requestPermission === "function") {
        const permission = await orientationConstructor.requestPermission()

        if (permission !== "granted") {
          setSensorState("blocked")
          return
        }
      }

      sensorCleanupRef.current?.()
      sensorSampleRef.current = null

      const handleOrientation = (event: DeviceOrientationEvent) => {
        if (sensorSampleRef.current && performance.now() - sensorSampleRef.current.time < 650) {
          return
        }

        const beta = event.beta ?? 0
        const gamma = event.gamma ?? 0
        applySensorGravity({
          x: clamp(gamma / 45, -1, 1),
          y: clamp(beta / 45, -1, 1),
        })
      }

      const handleMotion = (event: DeviceMotionEvent) => {
        const acceleration = event.accelerationIncludingGravity

        if (!acceleration) {
          return
        }

        applySensorGravity(projectAccelerationToScreen(acceleration))
      }

      window.addEventListener("deviceorientation", handleOrientation)
      window.addEventListener("devicemotion", handleMotion)
      sensorCleanupRef.current = () => {
        window.removeEventListener("deviceorientation", handleOrientation)
        window.removeEventListener("devicemotion", handleMotion)
      }
      setSensorState("active")
    } catch {
      setSensorState("blocked")
    }
  }

  function disableSensors() {
    sensorCleanupRef.current?.()
    sensorCleanupRef.current = null
    setSensorState("manual")
  }

  function applySensorGravity(sample: Gravity | null) {
    if (!sample) {
      return
    }

    gravityTargetRef.current = sample
    sensorSampleRef.current = {
      gravity: sample,
      time: performance.now(),
    }
  }

  return (
    <section className="hourglass-demo">
      <div className="hourglass-viewport" ref={containerRef}>
        <canvas aria-label="Pixel sand hourglass particle simulation" ref={canvasRef} />
      </div>

      <Card
        className={controlsOpen ? "hourglass-panel" : "hourglass-panel collapsed"}
        title={
          <div className="hourglass-panel-header">
            <span>Pixel sand</span>
            <Button fill="none" onClick={() => setControlsOpen((value) => !value)} size="mini">
              {controlsOpen ? "Hide" : "Controls"}
            </Button>
          </div>
        }
      >
        <div className="hourglass-status-grid">
          <div>
            <span>Grains</span>
            <strong>{stats.grains.toLocaleString()}</strong>
          </div>
          <div>
            <span>Lower</span>
            <strong>{Math.round(stats.lower * 100)}%</strong>
          </div>
          <div>
            <span>FPS</span>
            <strong>{stats.fps}</strong>
          </div>
          <div>
            <span>Gravity</span>
            <strong>{stats.gravity}</strong>
          </div>
        </div>

        {controlsOpen ? (
          <div className="hourglass-controls">
            <div className="hourglass-switch-row">
              <span>Run</span>
              <Switch checked={!paused} onChange={(checked) => setPaused(!checked)} />
            </div>

            {sensorState === "active" ? (
              <Button block color="primary" fill="outline" onClick={disableSensors} size="small">
                Manual gravity
              </Button>
            ) : (
              <>
                <Button block color="primary" onClick={enableSensors} size="small">
                  Enable gravity
                </Button>
                <ControlSlider
                  label="Angle"
                  max={180}
                  min={-180}
                  onChange={setAngle}
                  step={1}
                  value={angle}
                />
              </>
            )}

            <ControlSlider
              label="Steps"
              max={14}
              min={1}
              onChange={setSteps}
              step={1}
              value={steps}
            />
            <ControlSlider
              label="Fill"
              max={96}
              min={36}
              onChange={setFill}
              step={2}
              value={fill}
            />
          </div>
        ) : null}

        <Space block wrap>
          <Button fill="outline" onClick={() => setAngle(0)} size="small">
            Level
          </Button>
          <Button
            fill="outline"
            onClick={() => {
              resetRequestRef.current += 1
            }}
            size="small"
          >
            Reset
          </Button>
          <Button
            fill="outline"
            onClick={() => setAngle((value) => (value > 0 ? value - 180 : value + 180))}
            size="small"
          >
            Flip
          </Button>
          <span className={`hourglass-status ${sensorState}`}>
            {formatSensorState(sensorState)}
          </span>
        </Space>
      </Card>
    </section>
  )
}

function createSim(): Sim {
  const canvas = document.createElement("canvas")
  canvas.width = simWidth
  canvas.height = simHeight
  const ctx = canvas.getContext("2d", { alpha: false })

  if (!ctx) {
    throw new Error("2D canvas is unavailable")
  }

  const allowed = new Uint8Array(simWidth * simHeight)
  const outline = new Uint8Array(simWidth * simHeight)
  const grains = new Uint8Array(simWidth * simHeight)
  const shade = new Uint8Array(simWidth * simHeight)

  for (let y = 0; y < simHeight; y += 1) {
    for (let x = 0; x < simWidth; x += 1) {
      const index = y * simWidth + x
      allowed[index] = isInsideGlass(x, y) ? 1 : 0
    }
  }

  for (let y = 1; y < simHeight - 1; y += 1) {
    for (let x = 1; x < simWidth - 1; x += 1) {
      const index = y * simWidth + x

      if (allowed[index] === 1) {
        continue
      }

      if (
        allowed[index - 1] === 1 ||
        allowed[index + 1] === 1 ||
        allowed[index - simWidth] === 1 ||
        allowed[index + simWidth] === 1
      ) {
        outline[index] = 1
      }
    }
  }

  return {
    allowed,
    canvas,
    ctx,
    grains,
    height: simHeight,
    image: ctx.createImageData(simWidth, simHeight),
    outline,
    shade,
    width: simWidth,
  }
}

function seedSand(sim: Sim, fillPercent: number) {
  sim.grains.fill(0)
  sim.shade.fill(0)

  const fillLimit = Math.floor(centerY - 9)
  const fillStart = Math.floor(centerY - ((centerY - topCap - 4) * fillPercent) / 100)

  for (let y = fillStart; y < fillLimit; y += 1) {
    for (let x = 0; x < sim.width; x += 1) {
      const index = y * sim.width + x

      if (sim.allowed[index] === 1 && Math.random() > 0.03) {
        sim.grains[index] = 1
        sim.shade[index] = Math.floor(Math.random() * 5)
      }
    }
  }
}

function stepSand(sim: Sim, gravity: Gravity, nonce: number) {
  const directions = getMoveDirections(gravity, nonce)
  const primary = directions[0] ?? { dx: 0, dy: 1 }
  const yDescending = Math.abs(gravity.y) > 0.08 ? gravity.y > 0 : hash2(nonce, 13) > 0.5
  const xDescending = Math.abs(gravity.x) > 0.08 ? gravity.x > 0 : hash2(nonce, 29) > 0.5
  const yStart = yDescending ? sim.height - 2 : 1
  const yEnd = yDescending ? 0 : sim.height - 1
  const yStep = yDescending ? -1 : 1

  for (let y = yStart; y !== yEnd; y += yStep) {
    const rowNoise = hash2(y, nonce) > 0.5

    for (let pass = 1; pass < sim.width - 1; pass += 1) {
      const x = xDescending !== rowNoise ? sim.width - 1 - pass : pass
      const index = y * sim.width + x

      if (sim.grains[index] === 0) {
        continue
      }

      if (tryDirections(sim, index, x, y, directions)) {
        continue
      }

      const pressure = hasBackPressure(sim, x, y, primary)
      const sideFirst = getPerpendicular(primary, rowNoise)

      if (pressure && tryMove(sim, index, x, y, sideFirst.dx, sideFirst.dy)) {
        continue
      }

      if (pressure && tryMove(sim, index, x, y, -sideFirst.dx, -sideFirst.dy)) {
        continue
      }

      if (pressure && hash2(index, nonce) > 0.78) {
        tryMove(sim, index, x, y, primary.dx + sideFirst.dx, primary.dy + sideFirst.dy)
      }
    }
  }
}

function getMoveDirections(gravity: Gravity, nonce: number) {
  const jitter = hash2(nonce, 97) > 0.5 ? 0.018 : -0.018

  return neighborDirections
    .map((direction) => {
      const length = Math.hypot(direction.dx, direction.dy)
      const sideNoise = (direction.dx - direction.dy) * jitter
      const score = (direction.dx * gravity.x + direction.dy * gravity.y) / length + sideNoise
      return { direction, score }
    })
    .filter((entry) => entry.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.direction)
}

function tryDirections(sim: Sim, index: number, x: number, y: number, directions: Direction[]) {
  for (const direction of directions) {
    if (tryMove(sim, index, x, y, direction.dx, direction.dy)) {
      return true
    }
  }

  return false
}

function tryMove(sim: Sim, index: number, x: number, y: number, dx: number, dy: number) {
  const targetX = x + dx
  const targetY = y + dy

  if (targetX < 1 || targetX >= sim.width - 1 || targetY < 1 || targetY >= sim.height - 1) {
    return false
  }

  const target = targetY * sim.width + targetX

  if (sim.allowed[target] === 0 || sim.grains[target] === 1) {
    return false
  }

  sim.grains[target] = 1
  sim.shade[target] = sim.shade[index]
  sim.grains[index] = 0
  sim.shade[index] = 0
  return true
}

function hasBackPressure(sim: Sim, x: number, y: number, primary: Direction) {
  const backX = x - primary.dx
  const backY = y - primary.dy

  if (!isOpenCoordinate(sim, backX, backY)) {
    return false
  }

  const perpendicular = getPerpendicular(primary, false)
  const back = backY * sim.width + backX
  return (
    sim.grains[back] === 1 ||
    hasGrain(sim, backX + perpendicular.dx, backY + perpendicular.dy) ||
    hasGrain(sim, backX - perpendicular.dx, backY - perpendicular.dy)
  )
}

function getPerpendicular(primary: Direction, flip: boolean): Direction {
  const direction = {
    dx: primary.dy,
    dy: -primary.dx,
  }

  return flip ? { dx: -direction.dx, dy: -direction.dy } : direction
}

function isOpenCoordinate(sim: Sim, x: number, y: number) {
  return x >= 1 && x < sim.width - 1 && y >= 1 && y < sim.height - 1
}

function hasGrain(sim: Sim, x: number, y: number) {
  return isOpenCoordinate(sim, x, y) && sim.grains[y * sim.width + x] === 1
}

function settleOverload(sim: Sim) {
  for (let attempts = 0; attempts < 900; attempts += 1) {
    const x = 2 + Math.floor(Math.random() * (sim.width - 4))
    const y = 2 + Math.floor(Math.random() * (sim.height - 4))
    const index = y * sim.width + x

    if (sim.grains[index] === 0) {
      continue
    }

    const left = index - 1
    const right = index + 1

    if (sim.allowed[left] === 1 && sim.grains[left] === 0 && Math.random() > 0.5) {
      sim.grains[left] = 1
      sim.shade[left] = sim.shade[index]
      sim.grains[index] = 0
      sim.shade[index] = 0
    } else if (sim.allowed[right] === 1 && sim.grains[right] === 0) {
      sim.grains[right] = 1
      sim.shade[right] = sim.shade[index]
      sim.grains[index] = 0
      sim.shade[index] = 0
    }
  }
}

function drawSim(
  context: CanvasRenderingContext2D,
  displayCanvas: HTMLCanvasElement,
  sim: Sim,
  gravity: Gravity
) {
  const data = sim.image.data

  for (let index = 0; index < sim.grains.length; index += 1) {
    const offset = index * 4

    if (sim.grains[index] === 1) {
      const tone = sim.shade[index]
      data[offset] = 205 + tone * 9
      data[offset + 1] = 150 + tone * 7
      data[offset + 2] = 72 + tone * 5
      data[offset + 3] = 255
    } else if (sim.allowed[index] === 1) {
      data[offset] = 11
      data[offset + 1] = 24
      data[offset + 2] = 26
      data[offset + 3] = 255
    } else if (sim.outline[index] === 1) {
      data[offset] = 94
      data[offset + 1] = 175
      data[offset + 2] = 182
      data[offset + 3] = 255
    } else {
      data[offset] = 5
      data[offset + 1] = 10
      data[offset + 2] = 12
      data[offset + 3] = 255
    }
  }

  drawFrame(sim)

  const width = displayCanvas.width / Math.min(window.devicePixelRatio, 2)
  const height = displayCanvas.height / Math.min(window.devicePixelRatio, 2)
  const scale = Math.floor(
    Math.min(width / (sim.width + displayPaddingX), height / (sim.height + displayPaddingY))
  )
  const pixelScale = Math.max(2, scale)
  const drawWidth = sim.width * pixelScale
  const drawHeight = sim.height * pixelScale
  const left = Math.floor((width - drawWidth) / 2)
  const top = Math.floor((height - drawHeight) / 2)

  sim.ctx.putImageData(sim.image, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = "#051012"
  context.fillRect(0, 0, width, height)
  context.drawImage(sim.canvas, left, top, drawWidth, drawHeight)
  drawGravityNeedle(context, left, top, pixelScale, gravity)
}

function drawFrame(sim: Sim) {
  const data = sim.image.data

  for (let y = 0; y < sim.height; y += 1) {
    for (const x of [21, sim.width - 22]) {
      const index = y * sim.width + x
      const offset = index * 4
      data[offset] = 92
      data[offset + 1] = 61
      data[offset + 2] = 40
      data[offset + 3] = 255
    }
  }

  for (const y of [8, sim.height - 9]) {
    for (let x = 19; x < sim.width - 19; x += 1) {
      const index = y * sim.width + x
      const offset = index * 4
      data[offset] = 124
      data[offset + 1] = 82
      data[offset + 2] = 48
      data[offset + 3] = 255
    }
  }
}

function drawGravityNeedle(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  pixelScale: number,
  gravity: Gravity
) {
  const x = left + 18 * pixelScale
  const y = top + 24 * pixelScale
  const length = 13 * pixelScale
  context.strokeStyle = "#f6c96f"
  context.lineWidth = Math.max(2, pixelScale)
  context.beginPath()
  context.moveTo(x, y)
  context.lineTo(x + gravity.x * length, y + gravity.y * length)
  context.stroke()
}

function getLowerFraction(sim: Sim, gravity: Gravity) {
  let total = 0
  let lower = 0
  const centerProjection = (sim.width / 2) * gravity.x + (sim.height / 2) * gravity.y

  for (let y = 0; y < sim.height; y += 1) {
    for (let x = 0; x < sim.width; x += 1) {
      const index = y * sim.width + x

      if (sim.grains[index] === 0) {
        continue
      }

      total += 1

      if (x * gravity.x + y * gravity.y > centerProjection) {
        lower += 1
      }
    }
  }

  return total === 0 ? 0 : lower / total
}

function countGrains(grains: Uint8Array) {
  let count = 0

  for (const grain of grains) {
    count += grain
  }

  return count
}

function isInsideGlass(x: number, y: number) {
  if (y <= topCap || y >= bottomCap) {
    return false
  }

  const centerX = simWidth / 2
  const dy = Math.abs((y - centerY) / (centerY - topCap))
  const eased = dy * dy * (3 - 2 * dy)
  const radius = 5.2 + 63 * eased ** 0.62
  const neckBias = Math.max(0, 1 - Math.abs(y - centerY) / 11)
  const neckRadius = radius - neckBias * 1.8
  return Math.abs(x - centerX) < neckRadius
}

function normalizeGravity(gravity: Gravity) {
  const length = Math.hypot(gravity.x, gravity.y) || 1
  gravity.x /= length
  gravity.y /= length
}

function projectAccelerationToScreen(acceleration: DeviceMotionEventAcceleration): Gravity | null {
  const projectedX = -(acceleration.x ?? 0)
  const projectedY = acceleration.y ?? 0
  const magnitude = Math.hypot(projectedX, projectedY)

  if (magnitude < minimumProjectedGravity) {
    return null
  }

  return {
    x: projectedX / magnitude,
    y: projectedY / magnitude,
  }
}

function hash2(a: number, b: number) {
  let value = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35)
  value ^= value >>> 16
  return (value >>> 0) / 4294967295
}

function asNumber(value: SliderValue) {
  return Array.isArray(value) ? value[0] : value
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function ControlSlider({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <div className="control-slider">
      <span>
        {label}
        <strong>{formatControlValue(value, step)}</strong>
      </span>
      <Slider
        max={max}
        min={min}
        onChange={(nextValue: SliderValue) => onChange(asNumber(nextValue))}
        step={step}
        value={value}
      />
    </div>
  )
}

function formatControlValue(value: number, step: number) {
  return step < 1 ? value.toFixed(2) : String(Math.round(value))
}

function formatSensorState(sensorState: SensorState) {
  if (sensorState === "active") {
    return "sensor"
  }

  if (sensorState === "blocked") {
    return "blocked"
  }

  if (sensorState === "unsupported") {
    return "unsupported"
  }

  return "manual"
}
