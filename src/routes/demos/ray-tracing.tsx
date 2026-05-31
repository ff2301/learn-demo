import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, ProgressBar, Slider, Space } from "antd-mobile"
import { useEffect, useRef, useState } from "react"
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three"

type SliderValue = number | [number, number]

type RenderStats = {
  accumulatedSamples: number
  targetSamples: number
  resolution: string
  running: boolean
}

const sampleVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const sampleFragmentShader = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uPreviousTexture;
uniform vec2 uResolution;
uniform float uAccumulatedSamples;
uniform int uSamplesThisFrame;
uniform int uMaxBounces;
uniform float uLightPower;
uniform float uGlassIor;
uniform float uFrameIndex;
uniform float uTime;

const float PI = 3.14159265359;
const float FAR_CLIP = 1000.0;
const int MAX_SAMPLES = 8;
const int MAX_BOUNCES = 10;

struct Hit {
  float t;
  vec3 position;
  vec3 normal;
  vec3 albedo;
  float roughness;
  int material;
};

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float random(inout vec3 seed) {
  float value = hash(seed);
  seed += vec3(17.13, 31.71, 47.43) + value;
  return value;
}

vec3 randomUnitVector(inout vec3 seed) {
  float z = random(seed) * 2.0 - 1.0;
  float a = random(seed) * 2.0 * PI;
  float r = sqrt(max(0.0, 1.0 - z * z));
  return vec3(r * cos(a), r * sin(a), z);
}

float sphereIntersect(vec3 origin, vec3 direction, vec3 center, float radius) {
  vec3 oc = origin - center;
  float b = dot(oc, direction);
  float c = dot(oc, oc) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) {
    return FAR_CLIP;
  }
  h = sqrt(h);
  float nearT = -b - h;
  float farT = -b + h;
  return nearT > 0.001 ? nearT : farT;
}

vec3 randomOnSphere(inout vec3 seed) {
  return randomUnitVector(seed);
}

float schlickFresnel(float cosTheta, float ior) {
  float r0 = (1.0 - ior) / (1.0 + ior);
  r0 = r0 * r0;
  return r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
}

void applySphere(
  inout Hit hit,
  vec3 origin,
  vec3 direction,
  vec3 center,
  float radius,
  vec3 albedo,
  float roughness,
  int material
) {
  float t = sphereIntersect(origin, direction, center, radius);
  if (t > 0.001 && t < hit.t) {
    hit.t = t;
    hit.position = origin + direction * t;
    hit.normal = normalize(hit.position - center);
    hit.albedo = albedo;
    hit.roughness = roughness;
    hit.material = material;
  }
}

void applyWall(
  inout Hit hit,
  vec3 origin,
  vec3 direction,
  vec3 normal,
  float planeOffset,
  vec3 minBounds,
  vec3 maxBounds,
  vec3 albedo,
  float roughness,
  int material
) {
  float denom = dot(direction, normal);
  if (abs(denom) < 0.0001) {
    return;
  }

  float t = (planeOffset - dot(origin, normal)) / denom;
  vec3 position = origin + direction * t;
  bool inside =
    position.x >= minBounds.x && position.x <= maxBounds.x &&
    position.y >= minBounds.y && position.y <= maxBounds.y &&
    position.z >= minBounds.z && position.z <= maxBounds.z;

  if (t > 0.001 && t < hit.t && inside) {
    hit.t = t;
    hit.position = position;
    hit.normal = normal;
    hit.albedo = albedo;
    hit.roughness = roughness;
    hit.material = material;
  }
}

Hit sceneIntersect(vec3 origin, vec3 direction) {
  Hit hit;
  hit.t = FAR_CLIP;
  hit.position = vec3(0.0);
  hit.normal = vec3(0.0, 1.0, 0.0);
  hit.albedo = vec3(1.0);
  hit.roughness = 1.0;
  hit.material = 0;

  vec3 minRoom = vec3(-2.35, -1.28, -3.1);
  vec3 maxRoom = vec3(2.35, 2.2, 2.75);

  applySphere(hit, origin, direction, vec3(-0.88, -0.62, -0.95), 0.62, vec3(0.96, 0.43, 0.29), 0.82, 0);
  applySphere(hit, origin, direction, vec3(0.88, -0.76, -1.72), 0.48, vec3(0.42, 0.72, 0.98), 0.55, 0);
  applySphere(hit, origin, direction, vec3(0.04, -0.72, -0.78), 0.42, vec3(0.92, 0.98, 1.0), 0.0, 3);
  applySphere(hit, origin, direction, vec3(-0.58, 1.42, -0.68), 0.16, vec3(16.0, 12.8, 4.2) * uLightPower, 0.0, 2);
  applySphere(hit, origin, direction, vec3(0.62, 1.2, -1.36), 0.14, vec3(5.0, 15.0, 7.2) * uLightPower, 0.0, 2);

  applyWall(hit, origin, direction, vec3(1.0, 0.0, 0.0), -2.35, minRoom, maxRoom, vec3(0.72, 0.20, 0.18), 0.86, 0);
  applyWall(hit, origin, direction, vec3(-1.0, 0.0, 0.0), -2.35, minRoom, maxRoom, vec3(0.18, 0.48, 0.34), 0.86, 0);
  applyWall(hit, origin, direction, vec3(0.0, 1.0, 0.0), -1.28, minRoom, maxRoom, vec3(0.72, 0.72, 0.68), 0.9, 0);
  applyWall(hit, origin, direction, vec3(0.0, -1.0, 0.0), -2.2, minRoom, maxRoom, vec3(0.62, 0.66, 0.70), 0.9, 0);
  applyWall(hit, origin, direction, vec3(0.0, 0.0, 1.0), -3.1, minRoom, maxRoom, vec3(0.96, 0.98, 1.0), 0.0, 1);
  applyWall(hit, origin, direction, vec3(0.0, 0.0, -1.0), -2.75, minRoom, maxRoom, vec3(0.96, 0.98, 1.0), 0.0, 1);

  return hit;
}

float shadowVisibility(vec3 origin, vec3 lightPosition) {
  vec3 toLight = lightPosition - origin;
  float lightDistance = length(toLight);
  vec3 lightDirection = toLight / lightDistance;
  Hit shadowHit = sceneIntersect(origin + lightDirection * 0.01, lightDirection);
  return shadowHit.t < lightDistance ? 0.0 : 1.0;
}

vec3 tracePath(vec3 origin, vec3 direction, inout vec3 seed) {
  vec3 radiance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  vec3 lightCenterA = vec3(-0.58, 1.42, -0.68);
  vec3 lightCenterB = vec3(0.62, 1.2, -1.36);
  float lightRadiusA = 0.16;
  float lightRadiusB = 0.14;
  vec3 lightColorA = vec3(28.0, 22.4, 7.4) * uLightPower;
  vec3 lightColorB = vec3(8.8, 26.4, 12.6) * uLightPower;

  for (int bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    if (bounce >= uMaxBounces) {
      break;
    }

    Hit hit = sceneIntersect(origin, direction);
    if (hit.t >= FAR_CLIP) {
      break;
    }

    if (hit.material == 2) {
      radiance += throughput * hit.albedo;
      break;
    }

    if (hit.material == 0) {
      float chooseLight = random(seed);
      vec3 lightCenter = chooseLight < 0.5 ? lightCenterA : lightCenterB;
      float lightRadius = chooseLight < 0.5 ? lightRadiusA : lightRadiusB;
      vec3 lightColor = (chooseLight < 0.5 ? lightColorA : lightColorB) * 2.0;
      vec3 lightPosition = lightCenter + randomOnSphere(seed) * lightRadius;
      vec3 toLight = normalize(lightPosition - hit.position);
      float diffuse = max(dot(hit.normal, toLight), 0.0);
      float lightDistance = length(lightPosition - hit.position);
      float attenuation = 1.0 / max(1.0, lightDistance * lightDistance * 0.34);
      float visible = shadowVisibility(hit.position + hit.normal * 0.01, lightPosition);
      radiance += throughput * hit.albedo * lightColor * diffuse * attenuation * visible;
    }

    if (hit.material == 1) {
      vec3 reflected = reflect(direction, hit.normal);
      direction = normalize(reflected);
      origin = hit.position + hit.normal * 0.012;
      throughput *= hit.albedo * 0.96;
    } else if (hit.material == 3) {
      vec3 normal = hit.normal;
      float eta = 1.0 / uGlassIor;
      float cosTheta = dot(-direction, normal);
      bool entering = cosTheta > 0.0;

      if (!entering) {
        normal = -normal;
        eta = uGlassIor;
        cosTheta = dot(-direction, normal);
      }

      float fresnel = schlickFresnel(clamp(cosTheta, 0.0, 1.0), uGlassIor);
      vec3 refracted = refract(direction, normal, eta);
      bool totalInternalReflection = length(refracted) < 0.001;

      if (totalInternalReflection || random(seed) < fresnel) {
        direction = normalize(reflect(direction, normal));
        origin = hit.position + normal * 0.012;
      } else {
        direction = normalize(refracted);
        origin = hit.position - normal * 0.012;
        throughput *= hit.albedo * 0.98;
      }
    } else {
      direction = normalize(hit.normal + randomUnitVector(seed));
      origin = hit.position + hit.normal * 0.012;
      throughput *= hit.albedo * 0.74;
    }

    if (max(throughput.r, max(throughput.g, throughput.b)) < 0.025) {
      break;
    }
  }

  return radiance;
}

vec3 renderSample(vec2 pixel, inout vec3 seed) {
  vec2 jitter = vec2(random(seed), random(seed)) - 0.5;
  vec2 uv = (pixel + jitter) / uResolution;
  vec2 screen = uv * 2.0 - 1.0;
  screen.x *= uResolution.x / uResolution.y;

  vec3 origin = vec3(0.0, 0.2, 2.18);
  vec3 target = vec3(0.0, -0.12, -1.05);
  vec3 forward = normalize(target - origin);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 direction = normalize(forward * 1.35 + right * screen.x + up * screen.y);

  return tracePath(origin, direction, seed);
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec3 seed = vec3(pixel, uFrameIndex + 1.0);
  vec3 color = vec3(0.0);
  float sampleCount = 0.0;

  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i >= uSamplesThisFrame) {
      break;
    }
    color += renderSample(pixel, seed);
    sampleCount += 1.0;
  }

  color /= max(sampleCount, 1.0);

  vec3 previous = texture2D(uPreviousTexture, vUv).rgb;
  float totalSamples = uAccumulatedSamples + sampleCount;
  vec3 accumulated = (previous * uAccumulatedSamples + color * sampleCount) / max(totalSamples, 1.0);

  gl_FragColor = vec4(accumulated, 1.0);
}
`

const displayFragmentShader = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTexture;
uniform float uExposure;

vec3 acesToneMap(vec3 color) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

void main() {
  vec3 color = texture2D(uTexture, vUv).rgb * uExposure;
  color = acesToneMap(color);
  color = pow(color, vec3(1.0 / 2.2));
  gl_FragColor = vec4(color, 1.0);
}
`

export const Route = createFileRoute("/demos/ray-tracing")({
  component: RayTracingDemo,
})

function RayTracingDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const settingsRef = useRef({
    targetSamples: 512,
    samplesPerFrame: 1,
    lightPower: 1.2,
    exposure: 1,
    glassIor: 1.5,
    maxBounces: 6,
    renderScale: 0.75,
    paused: false,
  })
  const resetRequestedRef = useRef(true)
  const [targetSamples, setTargetSamples] = useState(512)
  const [samplesPerFrame, setSamplesPerFrame] = useState(1)
  const [lightPower, setLightPower] = useState(1.2)
  const [exposure, setExposure] = useState(1)
  const [glassIor, setGlassIor] = useState(1.5)
  const [maxBounces, setMaxBounces] = useState(6)
  const [renderScale, setRenderScale] = useState(0.75)
  const [paused, setPaused] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(() => window.innerWidth > 760)
  const [stats, setStats] = useState<RenderStats>({
    accumulatedSamples: 0,
    targetSamples: 512,
    resolution: "0 x 0",
    running: true,
  })

  useEffect(() => {
    settingsRef.current = {
      targetSamples,
      samplesPerFrame,
      lightPower,
      exposure,
      glassIor,
      maxBounces,
      renderScale,
      paused,
    }
  }, [
    exposure,
    glassIor,
    lightPower,
    maxBounces,
    paused,
    renderScale,
    samplesPerFrame,
    targetSamples,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current

    if (!canvas || !container) {
      return
    }

    const renderContainer = container
    const renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    })
    renderer.autoClear = false
    renderer.setClearColor(0x000000, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new PlaneGeometry(2, 2)
    const sampleMaterial = new ShaderMaterial({
      vertexShader: sampleVertexShader,
      fragmentShader: sampleFragmentShader,
      uniforms: {
        uPreviousTexture: { value: null },
        uResolution: { value: new Vector2(1, 1) },
        uAccumulatedSamples: { value: 0 },
        uSamplesThisFrame: { value: 1 },
        uMaxBounces: { value: 6 },
        uLightPower: { value: 1.2 },
        uGlassIor: { value: 1.5 },
        uFrameIndex: { value: 0 },
        uTime: { value: 0 },
      },
    })
    const displayMaterial = new ShaderMaterial({
      vertexShader: sampleVertexShader,
      fragmentShader: displayFragmentShader,
      uniforms: {
        uTexture: { value: null },
        uExposure: { value: 1 },
      },
    })
    const sampleScene = new Scene()
    const displayScene = new Scene()
    sampleScene.add(new Mesh(geometry, sampleMaterial))
    displayScene.add(new Mesh(geometry.clone(), displayMaterial))

    let readTarget: WebGLRenderTarget | null = null
    let writeTarget: WebGLRenderTarget | null = null
    let targetWidth = 0
    let targetHeight = 0
    let accumulatedSamples = 0
    let frameIndex = 0
    let animationFrame = 0
    let lastStatsUpdate = 0
    let disposed = false

    function makeTarget(width: number, height: number) {
      return new WebGLRenderTarget(width, height, {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      })
    }

    function clearAccumulation() {
      accumulatedSamples = 0
      frameIndex = 0
      if (readTarget && writeTarget) {
        renderer.setRenderTarget(readTarget)
        renderer.clear()
        renderer.setRenderTarget(writeTarget)
        renderer.clear()
        renderer.setRenderTarget(null)
      }
    }

    function ensureSize() {
      const rect = renderContainer.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      const pixelRatio = renderer.getPixelRatio()
      const scale = settingsRef.current.renderScale
      const nextTargetWidth = Math.max(1, Math.floor(width * pixelRatio * scale))
      const nextTargetHeight = Math.max(1, Math.floor(height * pixelRatio * scale))

      renderer.setSize(width, height, false)

      if (nextTargetWidth === targetWidth && nextTargetHeight === targetHeight) {
        return
      }

      readTarget?.dispose()
      writeTarget?.dispose()
      readTarget = makeTarget(nextTargetWidth, nextTargetHeight)
      writeTarget = makeTarget(nextTargetWidth, nextTargetHeight)
      targetWidth = nextTargetWidth
      targetHeight = nextTargetHeight
      sampleMaterial.uniforms.uResolution.value.set(targetWidth, targetHeight)
      resetRequestedRef.current = true
    }

    function publishStats(force = false) {
      const now = performance.now()
      if (!force && now - lastStatsUpdate < 140) {
        return
      }
      lastStatsUpdate = now
      setStats({
        accumulatedSamples,
        targetSamples: settingsRef.current.targetSamples,
        resolution: `${targetWidth} x ${targetHeight}`,
        running:
          !settingsRef.current.paused && accumulatedSamples < settingsRef.current.targetSamples,
      })
    }

    function render() {
      if (disposed) {
        return
      }

      ensureSize()

      if (resetRequestedRef.current) {
        resetRequestedRef.current = false
        clearAccumulation()
      }

      const settings = settingsRef.current
      const samplesLeft = settings.targetSamples - accumulatedSamples

      if (!settings.paused && samplesLeft > 0 && readTarget && writeTarget) {
        const samplesThisFrame = Math.min(settings.samplesPerFrame, samplesLeft)
        sampleMaterial.uniforms.uPreviousTexture.value = readTarget.texture
        sampleMaterial.uniforms.uAccumulatedSamples.value = accumulatedSamples
        sampleMaterial.uniforms.uSamplesThisFrame.value = samplesThisFrame
        sampleMaterial.uniforms.uMaxBounces.value = settings.maxBounces
        sampleMaterial.uniforms.uLightPower.value = settings.lightPower
        sampleMaterial.uniforms.uGlassIor.value = settings.glassIor
        sampleMaterial.uniforms.uFrameIndex.value = frameIndex
        sampleMaterial.uniforms.uTime.value = performance.now() * 0.001

        renderer.setRenderTarget(writeTarget)
        renderer.render(sampleScene, camera)

        const previousReadTarget = readTarget
        readTarget = writeTarget
        writeTarget = previousReadTarget
        accumulatedSamples += samplesThisFrame
        frameIndex += 1
      }

      if (readTarget) {
        displayMaterial.uniforms.uTexture.value = readTarget.texture
        displayMaterial.uniforms.uExposure.value = settingsRef.current.exposure
        renderer.setRenderTarget(null)
        renderer.render(displayScene, camera)
      }

      publishStats()
      animationFrame = requestAnimationFrame(render)
    }

    render()

    const resizeObserver = new ResizeObserver(() => {
      resetRequestedRef.current = true
    })
    resizeObserver.observe(renderContainer)

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      readTarget?.dispose()
      writeTarget?.dispose()
      geometry.dispose()
      sampleMaterial.dispose()
      displayMaterial.dispose()
      renderer.dispose()
    }
  }, [])

  const progressPercent = Math.min(100, (stats.accumulatedSamples / stats.targetSamples) * 100)

  return (
    <section className="ray-demo">
      <div className="ray-viewport" ref={containerRef}>
        <canvas aria-label="Progressive ray tracing render" ref={canvasRef} />
      </div>

      <Card
        className={controlsOpen ? "ray-panel" : "ray-panel collapsed"}
        title={
          <div className="ray-panel-header">
            <span>Ray tracing</span>
            <Button fill="none" onClick={() => setControlsOpen((value) => !value)} size="mini">
              {controlsOpen ? "Hide" : "Controls"}
            </Button>
          </div>
        }
      >
        <div className="ray-stat-row">
          <span>{stats.accumulatedSamples} samples</span>
          <span>{stats.resolution}</span>
        </div>
        <ProgressBar percent={progressPercent} rounded />
        <Space block wrap>
          <Button
            fill="outline"
            onClick={() => {
              resetRequestedRef.current = true
            }}
            size="small"
          >
            Reset
          </Button>
          <Button color="primary" onClick={() => setPaused((value) => !value)} size="small">
            {paused ? "Resume" : "Pause"}
          </Button>
          <span className={stats.running ? "ray-status running" : "ray-status"}>
            {stats.running ? "Sampling" : "Settled"}
          </span>
        </Space>

        {controlsOpen ? (
          <div className="ray-controls">
            <ControlSlider
              label="Target samples"
              max={1024}
              min={32}
              onChange={setTargetSamples}
              step={32}
              value={targetSamples}
            />
            <ControlSlider
              label="Samples/frame"
              max={8}
              min={1}
              onChange={(value) => {
                resetRequestedRef.current = true
                setSamplesPerFrame(value)
              }}
              step={1}
              value={samplesPerFrame}
            />
            <ControlSlider
              label="Light power"
              max={3}
              min={0.3}
              onChange={(value) => {
                resetRequestedRef.current = true
                setLightPower(value)
              }}
              step={0.1}
              value={lightPower}
            />
            <ControlSlider
              label="Exposure"
              max={2}
              min={0.2}
              onChange={setExposure}
              step={0.05}
              value={exposure}
            />
            <ControlSlider
              label="Glass IOR"
              max={2.4}
              min={1}
              onChange={(value) => {
                resetRequestedRef.current = true
                setGlassIor(value)
              }}
              step={0.05}
              value={glassIor}
            />
            <ControlSlider
              label="Bounces"
              max={10}
              min={1}
              onChange={(value) => {
                resetRequestedRef.current = true
                setMaxBounces(value)
              }}
              step={1}
              value={maxBounces}
            />
            <ControlSlider
              label="Density"
              max={1}
              min={0.35}
              onChange={(value) => {
                resetRequestedRef.current = true
                setRenderScale(value)
              }}
              step={0.05}
              value={renderScale}
            />
          </div>
        ) : null}
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

function asNumber(value: SliderValue) {
  return Array.isArray(value) ? value[0] : value
}

function formatControlValue(value: number, step: number) {
  return step < 1 ? value.toFixed(2) : String(value)
}
