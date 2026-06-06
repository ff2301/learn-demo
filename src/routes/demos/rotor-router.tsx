import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, Slider, Space } from "antd-mobile"
import { useEffect, useRef, useState } from "react"

type SliderValue = number | [number, number]

type RotorStats = {
  cells: string
  escapes: number
  heads: number
  resolution: string
  running: boolean
  steps: number
  stepsPerSecond: number
  webgpuReady: boolean
}

const defaultHeadCount = 16
const defaultStepsPerHead = 4_000
const walkerWords = 8
const walkerByteSize = walkerWords * 4

const gpuBufferUsage = {
  copyDst: 8,
  copySrc: 4,
  mapRead: 1,
  storage: 128,
  uniform: 64,
} as const

const gpuMapMode = {
  read: 1,
} as const

const computeShader = `
struct SimParams {
  width: u32,
  height: u32,
  steps_per_head: u32,
  nonce: u32,
  head_count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

struct Walker {
  x: u32,
  y: u32,
  seed: u32,
  steps: u32,
  escapes: u32,
  nonce: u32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<storage, read_write> board: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> walkers: array<Walker>;
@group(0) @binding(2) var<uniform> params: SimParams;

fn hash(value: u32) -> u32 {
  var x = value;
  x = ((x >> 16u) ^ x) * 0x7feb352du;
  x = ((x >> 15u) ^ x) * 0x846ca68bu;
  return (x >> 16u) ^ x;
}

fn respawn(seed: u32, escapes: u32, steps: u32, head_index: u32) -> vec2<u32> {
  let next = hash(seed + escapes * 747796405u + steps * 2891336453u + head_index * 1013904223u);
  return vec2<u32>(next % params.width, (next / params.width) % params.height);
}

fn rotate_cell(index: u32) -> u32 {
  var current = atomicLoad(&board[index]);

  loop {
    let direction = (current + 1u) & 3u;
    let visits = min((current >> 2u) + 1u, 0x3fffffffu);
    let next = (visits << 2u) | direction;
    let exchange = atomicCompareExchangeWeak(&board[index], current, next);

    if (exchange.exchanged) {
      return direction;
    }

    current = exchange.old_value;
  }
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let head_index = global_id.x;

  if (head_index >= params.head_count) {
    return;
  }

  if (walkers[head_index].nonce != params.nonce) {
    let seed = hash(params.nonce + params.width * 4099u + params.height * 131u + head_index * 2654435761u);
    let start = respawn(seed, 0u, 0u, head_index);
    walkers[head_index].x = select(start.x, params.width / 2u, head_index == 0u);
    walkers[head_index].y = select(start.y, params.height / 2u, head_index == 0u);
    walkers[head_index].seed = seed;
    walkers[head_index].steps = 0u;
    walkers[head_index].escapes = 0u;
    walkers[head_index].nonce = params.nonce;
  }

  var x = walkers[head_index].x;
  var y = walkers[head_index].y;
  var steps = walkers[head_index].steps;
  var escapes = walkers[head_index].escapes;
  let seed = walkers[head_index].seed;

  for (var i = 0u; i < params.steps_per_head; i = i + 1u) {
    if (x >= params.width || y >= params.height) {
      let start = respawn(seed + i, escapes, steps, head_index);
      x = start.x;
      y = start.y;
    }

    let index = y * params.width + x;
    let direction = rotate_cell(index);
    steps = steps + 1u;

    var nx = i32(x);
    var ny = i32(y);

    switch direction {
      case 0u: {
        ny = ny - 1;
      }
      case 1u: {
        nx = nx + 1;
      }
      case 2u: {
        ny = ny + 1;
      }
      default: {
        nx = nx - 1;
      }
    }

    if (nx < 0 || ny < 0 || nx >= i32(params.width) || ny >= i32(params.height)) {
      escapes = escapes + 1u;
      let start = respawn(seed + i + 17u, escapes, steps, head_index);
      x = start.x;
      y = start.y;
    } else {
      x = u32(nx);
      y = u32(ny);
    }
  }

  walkers[head_index].x = x;
  walkers[head_index].y = y;
  walkers[head_index].steps = steps;
  walkers[head_index].escapes = escapes;
}
`

const renderShader = `
struct RenderParams {
  grid_width: f32,
  grid_height: f32,
  canvas_width: f32,
  canvas_height: f32,
  time: f32,
  head_count: f32,
  pad1: f32,
  pad2: f32,
};

struct Walker {
  x: u32,
  y: u32,
  seed: u32,
  steps: u32,
  escapes: u32,
  nonce: u32,
  pad0: u32,
  pad1: u32,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
};

@group(0) @binding(0) var<storage, read> board: array<u32>;
@group(0) @binding(1) var<storage, read> walkers: array<Walker>;
@group(0) @binding(2) var<uniform> params: RenderParams;

const MAX_RENDER_HEADS = 32u;

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: VertexOut;
  out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
  return out;
}

fn direction_color(direction: u32) -> vec3<f32> {
  switch direction {
    case 0u: {
      return vec3<f32>(0.19, 0.55, 0.98);
    }
    case 1u: {
      return vec3<f32>(0.05, 0.74, 0.54);
    }
    case 2u: {
      return vec3<f32>(0.95, 0.64, 0.20);
    }
    default: {
      return vec3<f32>(0.89, 0.26, 0.35);
    }
  }
}

@fragment
fn fragment_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let grid_size = vec2<f32>(params.grid_width, params.grid_height);
  let canvas_size = vec2<f32>(params.canvas_width, params.canvas_height);
  let cell_size = min(canvas_size.x / grid_size.x, canvas_size.y / grid_size.y);
  let board_size = grid_size * cell_size;
  let offset = (canvas_size - board_size) * 0.5;
  let local = position.xy - offset;

  if (local.x < 0.0 || local.y < 0.0 || local.x >= board_size.x || local.y >= board_size.y) {
    let vignette = 0.72 - 0.18 * length(position.xy / canvas_size - vec2<f32>(0.5));
    return vec4<f32>(vec3<f32>(0.015, 0.025, 0.035) * vignette, 1.0);
  }

  let cell = vec2<u32>(floor(local / cell_size));
  let index = cell.y * u32(params.grid_width) + cell.x;
  let value = board[index];
  let direction = value & 3u;
  let visits = value >> 2u;
  let heat = clamp(log2(f32(visits) + 1.0) / 9.0, 0.0, 1.0);
  let base = vec3<f32>(0.025, 0.036, 0.048);
  let pulse = 0.06 * sin(params.time * 2.4 + f32(cell.x) * 0.019 + f32(cell.y) * 0.027);
  var color = mix(base, direction_color(direction), 0.28 + heat * 0.72 + pulse);

  var marker = 0.0;
  let render_heads = min(u32(params.head_count), MAX_RENDER_HEADS);
  for (var head = 0u; head < MAX_RENDER_HEADS; head = head + 1u) {
    if (head >= render_heads) {
      break;
    }

    let walker_delta = vec2<f32>(cell) - vec2<f32>(f32(walkers[head].x), f32(walkers[head].y));
    let walker_distance = length(walker_delta);
    marker = max(marker, smoothstep(4.0, 0.0, walker_distance));
  }
  color = mix(color, vec3<f32>(1.0, 0.98, 0.82), marker * 0.78);

  if (cell_size > 4.0) {
    let cell_uv = fract(local / cell_size);
    let line = step(cell_uv.x, 0.035) + step(cell_uv.y, 0.035);
    color *= 1.0 - min(line, 1.0) * 0.18;
  }

  return vec4<f32>(pow(color, vec3<f32>(0.78)), 1.0);
}
`

export const Route = createFileRoute("/demos/rotor-router")({
  component: RotorRouterDemo,
})

function RotorRouterDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const settingsRef = useRef({
    gridSize: 768,
    headCount: defaultHeadCount,
    paused: false,
    resetNonce: 1,
    stepsPerHead: defaultStepsPerHead,
  })
  const [gridSize, setGridSize] = useState(768)
  const [headCount, setHeadCount] = useState(defaultHeadCount)
  const [stepsPerHead, setStepsPerHead] = useState(defaultStepsPerHead)
  const [paused, setPaused] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(() => window.innerWidth > 760)
  const [resetNonce, setResetNonce] = useState(1)
  const [stats, setStats] = useState<RotorStats>({
    cells: "768 x 768",
    escapes: 0,
    heads: defaultHeadCount,
    resolution: "0 x 0",
    running: true,
    steps: 0,
    stepsPerSecond: 0,
    webgpuReady: true,
  })

  useEffect(() => {
    settingsRef.current = {
      gridSize,
      headCount,
      paused,
      resetNonce,
      stepsPerHead,
    }
  }, [gridSize, headCount, paused, resetNonce, stepsPerHead])

  useEffect(() => {
    const canvasElement = canvasRef.current

    if (!canvasElement) {
      return
    }

    const canvas = canvasElement
    let disposed = false
    let animationFrame = 0
    let boardBuffer: GPUBuffer | null = null
    let walkerBuffer: GPUBuffer | null = null
    let simParamsBuffer: GPUBuffer | null = null
    let renderParamsBuffer: GPUBuffer | null = null
    let statsReadBuffer: GPUBuffer | null = null
    let computeBindGroup: GPUBindGroup | null = null
    let renderBindGroup: GPUBindGroup | null = null
    let computePipeline: GPUComputePipeline | null = null
    let renderPipeline: GPURenderPipeline | null = null
    let context: GPUCanvasContext | null = null
    let device: GPUDevice | null = null
    let presentationFormat: GPUTextureFormat | null = null
    let activeGridSize = 0
    let activeHeadCount = 0
    let activeNonce = 0
    let lastStatsStep = 0
    let lastStatsTime = performance.now()
    let lastPublish = 0
    let pendingStatsRead = false

    async function setup() {
      if (!navigator.gpu) {
        setStats((current) => ({ ...current, running: false, webgpuReady: false }))
        return
      }

      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })
      if (!adapter || disposed) {
        setStats((current) => ({ ...current, running: false, webgpuReady: false }))
        return
      }

      device = await adapter.requestDevice()
      if (disposed) {
        device.destroy()
        return
      }

      context = canvas.getContext("webgpu") as GPUCanvasContext | null
      if (!context) {
        setStats((current) => ({ ...current, running: false, webgpuReady: false }))
        return
      }

      presentationFormat = navigator.gpu.getPreferredCanvasFormat()
      context.configure({
        alphaMode: "opaque",
        device,
        format: presentationFormat,
      })

      const computeModule = device.createShaderModule({ code: computeShader })
      const renderModule = device.createShaderModule({ code: renderShader })
      computePipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
          entryPoint: "main",
          module: computeModule,
        },
      })
      renderPipeline = device.createRenderPipeline({
        layout: "auto",
        fragment: {
          entryPoint: "fragment_main",
          module: renderModule,
          targets: [{ format: presentationFormat }],
        },
        primitive: {
          topology: "triangle-list",
        },
        vertex: {
          entryPoint: "vertex_main",
          module: renderModule,
        },
      })

      rebuildSimulation()
      frame()
    }

    function makeInitialBoard(size: number) {
      return new Uint32Array(size * size)
    }

    function destroySimulationBuffers() {
      boardBuffer?.destroy()
      walkerBuffer?.destroy()
      simParamsBuffer?.destroy()
      renderParamsBuffer?.destroy()
      statsReadBuffer?.destroy()
      boardBuffer = null
      walkerBuffer = null
      simParamsBuffer = null
      renderParamsBuffer = null
      statsReadBuffer = null
      computeBindGroup = null
      renderBindGroup = null
      pendingStatsRead = false
    }

    function rebuildSimulation() {
      if (!device || !computePipeline || !renderPipeline) {
        return
      }

      const { gridSize: size, headCount: heads, resetNonce: nonce } = settingsRef.current
      destroySimulationBuffers()

      const board = makeInitialBoard(size)
      boardBuffer = device.createBuffer({
        mappedAtCreation: true,
        size: board.byteLength,
        usage: gpuBufferUsage.storage | gpuBufferUsage.copyDst,
      })
      new Uint32Array(boardBuffer.getMappedRange()).set(board)
      boardBuffer.unmap()

      const walkers = new Uint32Array(heads * walkerWords)
      for (let head = 0; head < heads; head += 1) {
        const offset = head * walkerWords
        walkers[offset] = size >> 1
        walkers[offset + 1] = size >> 1
        walkers[offset + 2] = (nonce * 65537 + head * 2654435761) >>> 0
        walkers[offset + 5] = 0
      }
      walkerBuffer = device.createBuffer({
        mappedAtCreation: true,
        size: walkers.byteLength,
        usage: gpuBufferUsage.copySrc | gpuBufferUsage.storage,
      })
      new Uint32Array(walkerBuffer.getMappedRange()).set(walkers)
      walkerBuffer.unmap()

      simParamsBuffer = device.createBuffer({
        size: 32,
        usage: gpuBufferUsage.copyDst | gpuBufferUsage.uniform,
      })
      renderParamsBuffer = device.createBuffer({
        size: 32,
        usage: gpuBufferUsage.copyDst | gpuBufferUsage.uniform,
      })
      statsReadBuffer = device.createBuffer({
        size: walkers.byteLength,
        usage: gpuBufferUsage.copyDst | gpuBufferUsage.mapRead,
      })

      computeBindGroup = device.createBindGroup({
        entries: [
          { binding: 0, resource: { buffer: boardBuffer } },
          { binding: 1, resource: { buffer: walkerBuffer } },
          { binding: 2, resource: { buffer: simParamsBuffer } },
        ],
        layout: computePipeline.getBindGroupLayout(0),
      })
      renderBindGroup = device.createBindGroup({
        entries: [
          { binding: 0, resource: { buffer: boardBuffer } },
          { binding: 1, resource: { buffer: walkerBuffer } },
          { binding: 2, resource: { buffer: renderParamsBuffer } },
        ],
        layout: renderPipeline.getBindGroupLayout(0),
      })

      activeGridSize = size
      activeHeadCount = heads
      activeNonce = nonce
      lastStatsStep = 0
      lastStatsTime = performance.now()
      setStats((current) => ({
        ...current,
        cells: `${size.toLocaleString()} x ${size.toLocaleString()}`,
        escapes: 0,
        heads,
        running: !settingsRef.current.paused,
        steps: 0,
        stepsPerSecond: 0,
        webgpuReady: true,
      }))
    }

    function ensureCanvasSize() {
      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio, 2)
      const width = Math.max(1, Math.floor(rect.width * pixelRatio))
      const height = Math.max(1, Math.floor(rect.height * pixelRatio))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      return { height, width }
    }

    function updateUniforms(width: number, height: number, now: number) {
      if (!device || !simParamsBuffer || !renderParamsBuffer) {
        return
      }

      const settings = settingsRef.current
      const simParams = new Uint32Array([
        settings.gridSize,
        settings.gridSize,
        settings.stepsPerHead,
        settings.resetNonce,
        settings.headCount,
        0,
        0,
        0,
      ])
      const renderParams = new Float32Array([
        settings.gridSize,
        settings.gridSize,
        width,
        height,
        now / 1000,
        settings.headCount,
        0,
        0,
      ])

      device.queue.writeBuffer(simParamsBuffer, 0, simParams)
      device.queue.writeBuffer(renderParamsBuffer, 0, renderParams)
    }

    function publishStatsFromGpu() {
      if (!device || !walkerBuffer || !statsReadBuffer || pendingStatsRead) {
        return
      }

      pendingStatsRead = true
      const encoder = device.createCommandEncoder()
      encoder.copyBufferToBuffer(
        walkerBuffer,
        0,
        statsReadBuffer,
        0,
        activeHeadCount * walkerByteSize
      )
      device.queue.submit([encoder.finish()])

      statsReadBuffer
        .mapAsync(gpuMapMode.read)
        .then(() => {
          if (!statsReadBuffer || disposed) {
            return
          }

          const values = new Uint32Array(statsReadBuffer.getMappedRange().slice(0))
          statsReadBuffer.unmap()
          pendingStatsRead = false

          let totalSteps = 0
          let totalEscapes = 0
          for (let head = 0; head < activeHeadCount; head += 1) {
            const offset = head * walkerWords
            totalSteps += values[offset + 3]
            totalEscapes += values[offset + 4]
          }

          const now = performance.now()
          const elapsed = Math.max(1, now - lastStatsTime)
          const stepsPerSecond = Math.round(((totalSteps - lastStatsStep) * 1000) / elapsed)
          lastStatsStep = totalSteps
          lastStatsTime = now

          setStats({
            cells: `${activeGridSize.toLocaleString()} x ${activeGridSize.toLocaleString()}`,
            escapes: totalEscapes,
            heads: activeHeadCount,
            resolution: `${canvas.width} x ${canvas.height}`,
            running: !settingsRef.current.paused,
            steps: totalSteps,
            stepsPerSecond,
            webgpuReady: true,
          })
        })
        .catch(() => {
          pendingStatsRead = false
        })
    }

    function frame() {
      if (disposed || !device || !context || !computePipeline || !renderPipeline) {
        return
      }

      if (
        activeGridSize !== settingsRef.current.gridSize ||
        activeHeadCount !== settingsRef.current.headCount ||
        activeNonce !== settingsRef.current.resetNonce
      ) {
        rebuildSimulation()
      }

      if (
        !boardBuffer ||
        !walkerBuffer ||
        !computeBindGroup ||
        !renderBindGroup ||
        !simParamsBuffer ||
        !renderParamsBuffer
      ) {
        animationFrame = requestAnimationFrame(frame)
        return
      }

      const now = performance.now()
      const { height, width } = ensureCanvasSize()
      updateUniforms(width, height, now)

      const encoder = device.createCommandEncoder()
      if (!settingsRef.current.paused) {
        const pass = encoder.beginComputePass()
        pass.setPipeline(computePipeline)
        pass.setBindGroup(0, computeBindGroup)
        pass.dispatchWorkgroups(settingsRef.current.headCount)
        pass.end()
      }

      const textureView = context.getCurrentTexture().createView()
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            clearValue: { a: 1, b: 0.03, g: 0.02, r: 0.01 },
            loadOp: "clear",
            storeOp: "store",
            view: textureView,
          },
        ],
      })
      renderPass.setPipeline(renderPipeline)
      renderPass.setBindGroup(0, renderBindGroup)
      renderPass.draw(3)
      renderPass.end()
      device.queue.submit([encoder.finish()])

      if (now - lastPublish > 220) {
        lastPublish = now
        publishStatsFromGpu()
      }

      animationFrame = requestAnimationFrame(frame)
    }

    setup()

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      destroySimulationBuffers()
      device?.destroy()
    }
  }, [])

  return (
    <section className="rotor-demo">
      <canvas
        aria-label="Rotor-router WebGPU simulation"
        className="rotor-canvas"
        ref={canvasRef}
      />

      {!stats.webgpuReady ? (
        <Card className="rotor-panel" title="WebGPU required">
          <p className="rotor-note">
            This demo needs a browser with WebGPU enabled, such as current Chrome or Edge.
          </p>
        </Card>
      ) : (
        <Card
          className={`rotor-panel${controlsOpen ? "" : " collapsed"}`}
          title={
            <div className="rotor-panel-header">
              <span>Rotor-router field</span>
              <Button fill="none" onClick={() => setControlsOpen((value) => !value)} size="small">
                {controlsOpen ? "Hide" : "Show"}
              </Button>
            </div>
          }
        >
          {controlsOpen ? (
            <div className="rotor-controls">
              <div className="rotor-stat-grid">
                <div>
                  <span>Grid</span>
                  <strong>{stats.cells}</strong>
                </div>
                <div>
                  <span>Heads</span>
                  <strong>{stats.heads.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Steps</span>
                  <strong>{stats.steps.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Escapes</span>
                  <strong>{stats.escapes.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Speed</span>
                  <strong>{stats.stepsPerSecond.toLocaleString()}/s</strong>
                </div>
              </div>

              <ControlSlider
                label="Grid width"
                max={1536}
                min={256}
                onChange={setGridSize}
                step={128}
                value={gridSize}
              />
              <ControlSlider
                label="Heads"
                max={128}
                min={1}
                onChange={setHeadCount}
                step={1}
                value={headCount}
              />
              <ControlSlider
                label="Steps / head / frame"
                max={20_000}
                min={500}
                onChange={setStepsPerHead}
                step={500}
                value={stepsPerHead}
              />

              <Space block wrap>
                <Button color="primary" onClick={() => setPaused((value) => !value)}>
                  {paused ? "Run" : "Pause"}
                </Button>
                <Button onClick={() => setResetNonce((value) => value + 1)}>Reset</Button>
              </Space>

              <div className={`rotor-status${stats.running ? " running" : ""}`}>
                {stats.running ? "Running" : "Paused"} · {stats.resolution}
              </div>
            </div>
          ) : (
            <div className={`rotor-status${stats.running ? " running" : ""}`}>
              {stats.stepsPerSecond.toLocaleString()}/s
            </div>
          )}
        </Card>
      )}
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
        <strong>{value.toLocaleString()}</strong>
      </span>
      <Slider
        max={max}
        min={min}
        onChange={(nextValue: SliderValue) => {
          if (typeof nextValue === "number") {
            onChange(nextValue)
          }
        }}
        step={step}
        value={value}
      />
    </div>
  )
}
