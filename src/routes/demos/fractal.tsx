import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, Slider, Space, Switch } from "antd-mobile"
import { useEffect, useRef, useState } from "react"
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three"

type SliderValue = number | [number, number]
type FractalMode = "mandelbrot" | "julia" | "newton"

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uJuliaSeed;
uniform float uZoom;
uniform float uTime;
uniform float uColorShift;
uniform int uIterations;
uniform int uMode;
uniform int uDegree;
uniform bool uAnimate;

const int MAX_ITERATIONS = 420;
const int MAX_DEGREE = 9;
const float TAU = 6.28318530718;

vec3 palette(float t) {
  t = fract(t * 2.35 + uColorShift);
  vec3 ink = vec3(0.02, 0.05, 0.11);
  vec3 teal = vec3(0.02, 0.62, 0.58);
  vec3 gold = vec3(0.96, 0.66, 0.20);
  vec3 coral = vec3(0.78, 0.20, 0.34);
  vec3 violet = vec3(0.28, 0.34, 0.88);
  vec3 color = mix(ink, teal, smoothstep(0.00, 0.32, t));
  color = mix(color, gold, smoothstep(0.24, 0.58, t));
  color = mix(color, coral, smoothstep(0.52, 0.78, t));
  color = mix(color, violet, smoothstep(0.72, 1.00, t));
  return color;
}

vec2 complexMultiply(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 complexDivide(vec2 a, vec2 b) {
  float denominator = max(dot(b, b), 0.000001);
  return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / denominator;
}

vec2 complexPower(vec2 z, int degree) {
  vec2 value = vec2(1.0, 0.0);

  for (int i = 0; i < MAX_DEGREE; i++) {
    if (i >= degree) {
      break;
    }

    value = complexMultiply(value, z);
  }

  return value;
}

float iterateEscape(vec2 point) {
  vec2 z = uMode == 0 ? vec2(0.0) : point;
  vec2 c = uMode == 0 ? point : uJuliaSeed;

  if (uMode == 1 && uAnimate) {
    c += vec2(cos(uTime * 0.23), sin(uTime * 0.19)) * 0.045;
  }

  float escapedAt = 0.0;

  for (int i = 0; i < MAX_ITERATIONS; i++) {
    if (i >= uIterations) {
      break;
    }

    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    float radiusSquared = dot(z, z);

    if (radiusSquared > 256.0) {
      float smoothIteration = float(i) + 1.0 - log2(log2(max(radiusSquared, 1.0001)) * 0.5);
      escapedAt = smoothIteration / float(uIterations);
      break;
    }
  }

  return escapedAt;
}

vec4 renderNewton(vec2 point) {
  vec2 z = point;
  float iterationsUsed = 0.0;
  float lastStep = 1.0;

  for (int i = 0; i < MAX_ITERATIONS; i++) {
    if (i >= uIterations) {
      break;
    }

    vec2 power = complexPower(z, uDegree);
    vec2 derivative = float(uDegree) * complexPower(z, uDegree - 1);
    vec2 step = complexDivide(power - vec2(1.0, 0.0), derivative);
    z -= step;
    iterationsUsed = float(i);
    lastStep = length(step);

    if (lastStep < 0.00008 || dot(z, z) > 1000000.0) {
      break;
    }
  }

  float degree = float(uDegree);
  float angle = atan(z.y, z.x);
  angle = angle < 0.0 ? angle + TAU : angle;
  float rootIndex = floor(mod(angle / TAU * degree + 0.5, degree));
  float convergence = iterationsUsed / float(uIterations);
  float rootTone = rootIndex / max(degree, 1.0);
  float boundary = smoothstep(0.0, 0.72, convergence);
  float filament = smoothstep(0.00015, 0.014, lastStep);
  float rings = 0.86 + 0.14 * cos(iterationsUsed * 0.72);
  vec3 color = palette(rootTone + uColorShift * 0.62);
  color *= mix(1.08, 0.26, boundary) * rings;
  color = mix(color, vec3(0.018, 0.024, 0.04), boundary * 0.36);
  color += filament * vec3(0.94, 0.76, 0.24) * (0.25 + boundary * 0.75);

  return vec4(pow(color, vec3(0.92)), 1.0);
}

void main() {
  vec2 screen = vUv * 2.0 - 1.0;
  screen.x *= uResolution.x / max(uResolution.y, 1.0);
  vec2 point = uCenter + screen / uZoom;

  if (uMode == 2) {
    gl_FragColor = renderNewton(point);
    return;
  }

  float escaped = iterateEscape(point);

  if (escaped <= 0.0) {
    float vignette = smoothstep(1.45, 0.25, length(screen));
    gl_FragColor = vec4(vec3(0.015, 0.018, 0.026) + vignette * vec3(0.02, 0.05, 0.04), 1.0);
    return;
  }

  float glow = pow(1.0 - escaped, 2.4);
  vec3 color = palette(escaped + uColorShift * 0.22);
  color += glow * vec3(0.38, 0.76, 0.58);
  color *= 0.76 + 0.24 * smoothstep(1.35, 0.2, length(screen));

  gl_FragColor = vec4(pow(color, vec3(0.92)), 1.0);
}
`

export const Route = createFileRoute("/demos/fractal")({
  component: FractalDemo,
})

function FractalDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const settingsRef = useRef({
    mode: "mandelbrot" as FractalMode,
    iterations: 180,
    center: new Vector2(-0.58, 0),
    zoom: 1.1,
    juliaSeed: new Vector2(-0.74, 0.16),
    colorShift: 0.12,
    degree: 3,
    animate: true,
  })
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    center: Vector2
  } | null>(null)

  const [mode, setMode] = useState<FractalMode>("mandelbrot")
  const [iterations, setIterations] = useState(180)
  const [zoom, setZoom] = useState(1.1)
  const [center, setCenter] = useState(() => new Vector2(-0.58, 0))
  const [juliaX, setJuliaX] = useState(-0.74)
  const [juliaY, setJuliaY] = useState(0.16)
  const [colorShift, setColorShift] = useState(0.12)
  const [degree, setDegree] = useState(3)
  const [animate, setAnimate] = useState(true)
  const [controlsOpen, setControlsOpen] = useState(() => window.innerWidth > 760)

  useEffect(() => {
    settingsRef.current = {
      mode,
      iterations,
      center,
      zoom,
      juliaSeed: new Vector2(juliaX, juliaY),
      colorShift,
      degree,
      animate,
    }
  }, [animate, center, colorShift, degree, iterations, juliaX, juliaY, mode, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current

    if (!canvas || !container) {
      return
    }

    const renderCanvas = canvas
    const renderContainer = container
    const renderer = new WebGLRenderer({
      canvas: renderCanvas,
      antialias: false,
      powerPreference: "high-performance",
    })
    renderer.setClearColor(0x05070b, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new PlaneGeometry(2, 2)
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uResolution: { value: new Vector2(1, 1) },
        uCenter: { value: new Vector2(-0.58, 0) },
        uJuliaSeed: { value: new Vector2(-0.74, 0.16) },
        uZoom: { value: 1.1 },
        uTime: { value: 0 },
        uColorShift: { value: 0.12 },
        uIterations: { value: 180 },
        uMode: { value: 0 },
        uDegree: { value: 3 },
        uAnimate: { value: true },
      },
    })
    const scene = new Scene()
    scene.add(new Mesh(geometry, material))

    let animationFrame = 0
    let disposed = false

    function ensureSize() {
      const rect = renderContainer.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      renderer.setSize(width, height, false)
      material.uniforms.uResolution.value.set(
        Math.floor(width * renderer.getPixelRatio()),
        Math.floor(height * renderer.getPixelRatio())
      )
    }

    function render() {
      if (disposed) {
        return
      }

      const settings = settingsRef.current
      ensureSize()
      material.uniforms.uCenter.value.copy(settings.center)
      material.uniforms.uJuliaSeed.value.copy(settings.juliaSeed)
      material.uniforms.uZoom.value = settings.zoom
      material.uniforms.uTime.value = performance.now() * 0.001
      material.uniforms.uColorShift.value = settings.colorShift
      material.uniforms.uIterations.value = settings.iterations
      material.uniforms.uMode.value = getModeIndex(settings.mode)
      material.uniforms.uDegree.value = settings.degree
      material.uniforms.uAnimate.value = settings.animate
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(render)
    }

    function setZoomAt(pointerX: number, pointerY: number, nextZoom: number) {
      const rect = renderCanvas.getBoundingClientRect()
      const settings = settingsRef.current
      const before = screenToFractal(pointerX, pointerY, rect, settings.center, settings.zoom)
      const clampedZoom = clamp(nextZoom, 0.28, 360)
      const after = screenToFractal(pointerX, pointerY, rect, settings.center, clampedZoom)
      const nextCenter = settings.center.clone().add(before.sub(after))
      setCenter(nextCenter)
      setZoom(clampedZoom)
    }

    function handlePointerDown(event: PointerEvent) {
      renderCanvas.setPointerCapture(event.pointerId)
      dragRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        center: settingsRef.current.center.clone(),
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }

      const rect = renderCanvas.getBoundingClientRect()
      const aspect = rect.width / Math.max(rect.height, 1)
      const dx = ((event.clientX - drag.x) / Math.max(rect.width, 1)) * 2 * aspect
      const dy = ((event.clientY - drag.y) / Math.max(rect.height, 1)) * 2
      setCenter(
        new Vector2(
          drag.center.x - dx / settingsRef.current.zoom,
          drag.center.y + dy / settingsRef.current.zoom
        )
      )
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null
        renderCanvas.releasePointerCapture(event.pointerId)
      }
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.86 : 1.16
      setZoomAt(event.clientX, event.clientY, settingsRef.current.zoom * factor)
    }

    renderCanvas.addEventListener("pointerdown", handlePointerDown)
    renderCanvas.addEventListener("pointermove", handlePointerMove)
    renderCanvas.addEventListener("pointerup", handlePointerUp)
    renderCanvas.addEventListener("pointercancel", handlePointerUp)
    renderCanvas.addEventListener("wheel", handleWheel, { passive: false })
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      renderCanvas.removeEventListener("pointerdown", handlePointerDown)
      renderCanvas.removeEventListener("pointermove", handlePointerMove)
      renderCanvas.removeEventListener("pointerup", handlePointerUp)
      renderCanvas.removeEventListener("pointercancel", handlePointerUp)
      renderCanvas.removeEventListener("wheel", handleWheel)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [])

  function resetView(nextMode = mode) {
    setMode(nextMode)
    setZoom(getDefaultZoom(nextMode))
    setCenter(getDefaultCenter(nextMode))
  }

  return (
    <section className="fractal-demo">
      <div className="fractal-viewport" ref={containerRef}>
        <canvas aria-label="GPU rendered Mandelbrot, Julia, and Newton fractal" ref={canvasRef} />
      </div>

      <Card
        className={controlsOpen ? "fractal-panel" : "fractal-panel collapsed"}
        title={
          <div className="fractal-panel-header">
            <span>Fractal shader</span>
            <Button fill="none" onClick={() => setControlsOpen((value) => !value)} size="mini">
              {controlsOpen ? "Hide" : "Controls"}
            </Button>
          </div>
        }
      >
        <div className="fractal-mode-row">
          <Button
            color={mode === "mandelbrot" ? "primary" : "default"}
            fill={mode === "mandelbrot" ? "solid" : "outline"}
            onClick={() => resetView("mandelbrot")}
            size="small"
          >
            Mandelbrot
          </Button>
          <Button
            color={mode === "julia" ? "primary" : "default"}
            fill={mode === "julia" ? "solid" : "outline"}
            onClick={() => resetView("julia")}
            size="small"
          >
            Julia
          </Button>
          <Button
            color={mode === "newton" ? "primary" : "default"}
            fill={mode === "newton" ? "solid" : "outline"}
            onClick={() => resetView("newton")}
            size="small"
          >
            Newton
          </Button>
        </div>

        <p className="fractal-note">
          {mode === "newton"
            ? `Newton 模式把切线迭代推广到复平面 z^${degree} - 1，颜色表示最终收敛到的根。`
            : "混沌系统常会产生分形结构，但不是任何混沌轨迹都天然呈现分形；这里用复平面迭代的逃逸时间集合来做可视化。"}
        </p>

        {controlsOpen ? (
          <div className="fractal-controls">
            <ControlSlider
              label="Zoom"
              max={360}
              min={0.3}
              onChange={setZoom}
              step={0.1}
              value={zoom}
            />
            <ControlSlider
              label="Iterations"
              max={420}
              min={48}
              onChange={setIterations}
              step={4}
              value={iterations}
            />
            <ControlSlider
              label="Color"
              max={1}
              min={0}
              onChange={setColorShift}
              step={0.01}
              value={colorShift}
            />
            {mode === "julia" ? (
              <>
                <ControlSlider
                  label="Julia real"
                  max={1}
                  min={-1}
                  onChange={setJuliaX}
                  step={0.01}
                  value={juliaX}
                />
                <ControlSlider
                  label="Julia imag"
                  max={1}
                  min={-1}
                  onChange={setJuliaY}
                  step={0.01}
                  value={juliaY}
                />
                <div className="fractal-switch-row">
                  <span>Animate seed</span>
                  <Switch checked={animate} onChange={setAnimate} />
                </div>
              </>
            ) : null}
            {mode === "newton" ? (
              <ControlSlider
                label="Degree"
                max={9}
                min={3}
                onChange={setDegree}
                step={1}
                value={degree}
              />
            ) : null}
          </div>
        ) : null}

        <Space block wrap>
          <Button fill="outline" onClick={() => resetView()} size="small">
            Reset view
          </Button>
          <Button
            fill="outline"
            onClick={() => {
              const nextZoom = clamp(zoom * 1.8, 0.28, 360)
              setZoom(nextZoom)
            }}
            size="small"
          >
            Zoom in
          </Button>
          <span className="fractal-stat">
            {center.x.toFixed(3)}, {center.y.toFixed(3)}
          </span>
        </Space>
      </Card>
    </section>
  )
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

function screenToFractal(
  pointerX: number,
  pointerY: number,
  rect: DOMRect,
  center: Vector2,
  zoom: number
) {
  const aspect = rect.width / Math.max(rect.height, 1)
  const screenX = ((pointerX - rect.left) / Math.max(rect.width, 1)) * 2 - 1
  const screenY = 1 - ((pointerY - rect.top) / Math.max(rect.height, 1)) * 2
  return new Vector2(center.x + (screenX * aspect) / zoom, center.y + screenY / zoom)
}

function asNumber(value: SliderValue) {
  return Array.isArray(value) ? value[0] : value
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getModeIndex(mode: FractalMode) {
  if (mode === "julia") {
    return 1
  }

  if (mode === "newton") {
    return 2
  }

  return 0
}

function getDefaultZoom(mode: FractalMode) {
  if (mode === "julia") {
    return 1.55
  }

  if (mode === "newton") {
    return 0.82
  }

  return 1.1
}

function getDefaultCenter(mode: FractalMode) {
  return mode === "mandelbrot" ? new Vector2(-0.58, 0) : new Vector2(0, 0)
}

function formatControlValue(value: number, step: number) {
  return step < 1 ? value.toFixed(2) : String(value)
}
