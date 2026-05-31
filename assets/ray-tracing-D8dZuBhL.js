import{_ as e,a as t,i as n,l as r,m as i,p as a,s as o,u as s}from"./index-DgMd-zFd.js";import{a as c,c as l,i as u,l as d,n as f,o as p,r as m,s as h,t as g,u as _}from"./three.module-CwvDz4Og.js";var v=e(i()),y=a(),b=`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,x=`
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
`,S=`
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
`;function C(){let e=(0,v.useRef)(null),n=(0,v.useRef)(null),i=(0,v.useRef)({targetSamples:512,samplesPerFrame:1,lightPower:1.2,exposure:1,glassIor:1.5,maxBounces:6,renderScale:.75,paused:!1}),a=(0,v.useRef)(!0),[C,T]=(0,v.useState)(512),[E,D]=(0,v.useState)(1),[O,k]=(0,v.useState)(1.2),[A,j]=(0,v.useState)(1),[M,N]=(0,v.useState)(1.5),[P,F]=(0,v.useState)(6),[I,L]=(0,v.useState)(.75),[R,z]=(0,v.useState)(!1),[B,V]=(0,v.useState)(()=>window.innerWidth>760),[H,U]=(0,v.useState)({accumulatedSamples:0,targetSamples:512,resolution:`0 x 0`,running:!0});(0,v.useEffect)(()=>{i.current={targetSamples:C,samplesPerFrame:E,lightPower:O,exposure:A,glassIor:M,maxBounces:P,renderScale:I,paused:R}},[A,M,O,P,R,I,E,C]),(0,v.useEffect)(()=>{let t=n.current,r=e.current;if(!t||!r)return;let o=r,s=new g({canvas:t,antialias:!1,powerPreference:`high-performance`});s.autoClear=!1,s.setClearColor(0,1),s.setPixelRatio(Math.min(window.devicePixelRatio,2));let v=new c(-1,1,1,-1,0,1),y=new p(2,2),C=new l({vertexShader:b,fragmentShader:x,uniforms:{uPreviousTexture:{value:null},uResolution:{value:new d(1,1)},uAccumulatedSamples:{value:0},uSamplesThisFrame:{value:1},uMaxBounces:{value:6},uLightPower:{value:1.2},uGlassIor:{value:1.5},uFrameIndex:{value:0},uTime:{value:0}}}),w=new l({vertexShader:b,fragmentShader:S,uniforms:{uTexture:{value:null},uExposure:{value:1}}}),T=new h,E=new h;T.add(new u(y,C)),E.add(new u(y.clone(),w));let D=null,O=null,k=0,A=0,j=0,M=0,N=0,P=0,F=!1;function I(e,t){return new _(e,t,{depthBuffer:!1,stencilBuffer:!1,type:f,minFilter:m,magFilter:m})}function L(){j=0,M=0,D&&O&&(s.setRenderTarget(D),s.clear(),s.setRenderTarget(O),s.clear(),s.setRenderTarget(null))}function R(){let e=o.getBoundingClientRect(),t=Math.max(1,Math.floor(e.width)),n=Math.max(1,Math.floor(e.height)),r=s.getPixelRatio(),c=i.current.renderScale,l=Math.max(1,Math.floor(t*r*c)),u=Math.max(1,Math.floor(n*r*c));s.setSize(t,n,!1),!(l===k&&u===A)&&(D?.dispose(),O?.dispose(),D=I(l,u),O=I(l,u),k=l,A=u,C.uniforms.uResolution.value.set(k,A),a.current=!0)}function z(e=!1){let t=performance.now();!e&&t-P<140||(P=t,U({accumulatedSamples:j,targetSamples:i.current.targetSamples,resolution:`${k} x ${A}`,running:!i.current.paused&&j<i.current.targetSamples}))}function B(){if(F)return;R(),a.current&&(a.current=!1,L());let e=i.current,t=e.targetSamples-j;if(!e.paused&&t>0&&D&&O){let n=Math.min(e.samplesPerFrame,t);C.uniforms.uPreviousTexture.value=D.texture,C.uniforms.uAccumulatedSamples.value=j,C.uniforms.uSamplesThisFrame.value=n,C.uniforms.uMaxBounces.value=e.maxBounces,C.uniforms.uLightPower.value=e.lightPower,C.uniforms.uGlassIor.value=e.glassIor,C.uniforms.uFrameIndex.value=M,C.uniforms.uTime.value=performance.now()*.001,s.setRenderTarget(O),s.render(T,v);let r=D;D=O,O=r,j+=n,M+=1}D&&(w.uniforms.uTexture.value=D.texture,w.uniforms.uExposure.value=i.current.exposure,s.setRenderTarget(null),s.render(E,v)),z(),N=requestAnimationFrame(B)}B();let V=new ResizeObserver(()=>{a.current=!0});return V.observe(o),()=>{F=!0,cancelAnimationFrame(N),V.disconnect(),D?.dispose(),O?.dispose(),y.dispose(),C.dispose(),w.dispose(),s.dispose()}},[]);let W=Math.min(100,H.accumulatedSamples/H.targetSamples*100);return(0,y.jsxs)(`section`,{className:`ray-demo`,children:[(0,y.jsx)(`div`,{className:`ray-viewport`,ref:e,children:(0,y.jsx)(`canvas`,{"aria-label":`Progressive ray tracing render`,ref:n})}),(0,y.jsxs)(r,{className:B?`ray-panel`:`ray-panel collapsed`,title:(0,y.jsxs)(`div`,{className:`ray-panel-header`,children:[(0,y.jsx)(`span`,{children:`Ray tracing`}),(0,y.jsx)(s,{fill:`none`,onClick:()=>V(e=>!e),size:`mini`,children:B?`Hide`:`Controls`})]}),children:[(0,y.jsxs)(`div`,{className:`ray-stat-row`,children:[(0,y.jsxs)(`span`,{children:[H.accumulatedSamples,` samples`]}),(0,y.jsx)(`span`,{children:H.resolution})]}),(0,y.jsx)(t,{percent:W,rounded:!0}),(0,y.jsxs)(o,{block:!0,wrap:!0,children:[(0,y.jsx)(s,{fill:`outline`,onClick:()=>{a.current=!0},size:`small`,children:`Reset`}),(0,y.jsx)(s,{color:`primary`,onClick:()=>z(e=>!e),size:`small`,children:R?`Resume`:`Pause`}),(0,y.jsx)(`span`,{className:H.running?`ray-status running`:`ray-status`,children:H.running?`Sampling`:`Settled`})]}),B?(0,y.jsxs)(`div`,{className:`ray-controls`,children:[(0,y.jsx)(w,{label:`Target samples`,max:1024,min:32,onChange:T,step:32,value:C}),(0,y.jsx)(w,{label:`Samples/frame`,max:8,min:1,onChange:e=>{a.current=!0,D(e)},step:1,value:E}),(0,y.jsx)(w,{label:`Light power`,max:3,min:.3,onChange:e=>{a.current=!0,k(e)},step:.1,value:O}),(0,y.jsx)(w,{label:`Exposure`,max:2,min:.2,onChange:j,step:.05,value:A}),(0,y.jsx)(w,{label:`Glass IOR`,max:2.4,min:1,onChange:e=>{a.current=!0,N(e)},step:.05,value:M}),(0,y.jsx)(w,{label:`Bounces`,max:10,min:1,onChange:e=>{a.current=!0,F(e)},step:1,value:P}),(0,y.jsx)(w,{label:`Density`,max:1,min:.35,onChange:e=>{a.current=!0,L(e)},step:.05,value:I})]}):null]})]})}function w({label:e,max:t,min:r,onChange:i,step:a,value:o}){return(0,y.jsxs)(`div`,{className:`control-slider`,children:[(0,y.jsxs)(`span`,{children:[e,(0,y.jsx)(`strong`,{children:E(o,a)})]}),(0,y.jsx)(n,{max:t,min:r,onChange:e=>i(T(e)),step:a,value:o})]})}function T(e){return Array.isArray(e)?e[0]:e}function E(e,t){return t<1?e.toFixed(2):String(e)}export{C as component};