import{_ as e,i as t,l as n,m as r,p as i,r as a,s as o,u as s}from"./index-D1xgABgR.js";import{a as c,c as l,i as u,l as d,o as f,s as p,t as m}from"./three.module-CwvDz4Og.js";var h=e(r()),g=i(),_=`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,v=`
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
`;function y(){let e=(0,h.useRef)(null),t=(0,h.useRef)(null),r=(0,h.useRef)({mode:`mandelbrot`,iterations:180,center:new d(-.58,0),zoom:1.1,juliaSeed:new d(-.74,.16),colorShift:.12,degree:3,animate:!0}),i=(0,h.useRef)(null),[y,S]=(0,h.useState)(`mandelbrot`),[D,O]=(0,h.useState)(180),[k,A]=(0,h.useState)(1.1),[j,M]=(0,h.useState)(()=>new d(-.58,0)),[N,P]=(0,h.useState)(-.74),[F,I]=(0,h.useState)(.16),[L,R]=(0,h.useState)(.12),[z,B]=(0,h.useState)(3),[V,H]=(0,h.useState)(!0),[U,W]=(0,h.useState)(()=>window.innerWidth>760);(0,h.useEffect)(()=>{r.current={mode:y,iterations:D,center:j,zoom:k,juliaSeed:new d(N,F),colorShift:L,degree:z,animate:V}},[V,j,L,z,D,N,F,y,k]),(0,h.useEffect)(()=>{let n=t.current,a=e.current;if(!n||!a)return;let o=n,s=a,h=new m({canvas:o,antialias:!1,powerPreference:`high-performance`});h.setClearColor(329483,1),h.setPixelRatio(Math.min(window.devicePixelRatio,2));let g=new c(-1,1,1,-1,0,1),y=new f(2,2),b=new l({vertexShader:_,fragmentShader:v,uniforms:{uResolution:{value:new d(1,1)},uCenter:{value:new d(-.58,0)},uJuliaSeed:{value:new d(-.74,.16)},uZoom:{value:1.1},uTime:{value:0},uColorShift:{value:.12},uIterations:{value:180},uMode:{value:0},uDegree:{value:3},uAnimate:{value:!0}}}),S=new p;S.add(new u(y,b));let T=0,E=!1;function D(){let e=s.getBoundingClientRect(),t=Math.max(1,Math.floor(e.width)),n=Math.max(1,Math.floor(e.height));h.setSize(t,n,!1),b.uniforms.uResolution.value.set(Math.floor(t*h.getPixelRatio()),Math.floor(n*h.getPixelRatio()))}function O(){if(E)return;let e=r.current;D(),b.uniforms.uCenter.value.copy(e.center),b.uniforms.uJuliaSeed.value.copy(e.juliaSeed),b.uniforms.uZoom.value=e.zoom,b.uniforms.uTime.value=performance.now()*.001,b.uniforms.uColorShift.value=e.colorShift,b.uniforms.uIterations.value=e.iterations,b.uniforms.uMode.value=w(e.mode),b.uniforms.uDegree.value=e.degree,b.uniforms.uAnimate.value=e.animate,h.render(S,g),T=requestAnimationFrame(O)}function k(e,t,n){let i=o.getBoundingClientRect(),a=r.current,s=x(e,t,i,a.center,a.zoom),c=C(n,.28,360),l=x(e,t,i,a.center,c);M(a.center.clone().add(s.sub(l))),A(c)}function j(e){o.setPointerCapture(e.pointerId),i.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,center:r.current.center.clone()}}function N(e){let t=i.current;if(!t||t.pointerId!==e.pointerId)return;let n=o.getBoundingClientRect(),a=n.width/Math.max(n.height,1),s=(e.clientX-t.x)/Math.max(n.width,1)*2*a,c=(e.clientY-t.y)/Math.max(n.height,1)*2;M(new d(t.center.x-s/r.current.zoom,t.center.y+c/r.current.zoom))}function P(e){i.current?.pointerId===e.pointerId&&(i.current=null,o.releasePointerCapture(e.pointerId))}function F(e){e.preventDefault();let t=e.deltaY>0?.86:1.16;k(e.clientX,e.clientY,r.current.zoom*t)}return o.addEventListener(`pointerdown`,j),o.addEventListener(`pointermove`,N),o.addEventListener(`pointerup`,P),o.addEventListener(`pointercancel`,P),o.addEventListener(`wheel`,F,{passive:!1}),O(),()=>{E=!0,cancelAnimationFrame(T),o.removeEventListener(`pointerdown`,j),o.removeEventListener(`pointermove`,N),o.removeEventListener(`pointerup`,P),o.removeEventListener(`pointercancel`,P),o.removeEventListener(`wheel`,F),y.dispose(),b.dispose(),h.dispose()}},[]);function G(e=y){S(e),A(T(e)),M(E(e))}return(0,g.jsxs)(`section`,{className:`fractal-demo`,children:[(0,g.jsx)(`div`,{className:`fractal-viewport`,ref:e,children:(0,g.jsx)(`canvas`,{"aria-label":`GPU rendered Mandelbrot, Julia, and Newton fractal`,ref:t})}),(0,g.jsxs)(n,{className:U?`fractal-panel`:`fractal-panel collapsed`,title:(0,g.jsxs)(`div`,{className:`fractal-panel-header`,children:[(0,g.jsx)(`span`,{children:`Fractal shader`}),(0,g.jsx)(s,{fill:`none`,onClick:()=>W(e=>!e),size:`mini`,children:U?`Hide`:`Controls`})]}),children:[(0,g.jsxs)(`div`,{className:`fractal-mode-row`,children:[(0,g.jsx)(s,{color:y===`mandelbrot`?`primary`:`default`,fill:y===`mandelbrot`?`solid`:`outline`,onClick:()=>G(`mandelbrot`),size:`small`,children:`Mandelbrot`}),(0,g.jsx)(s,{color:y===`julia`?`primary`:`default`,fill:y===`julia`?`solid`:`outline`,onClick:()=>G(`julia`),size:`small`,children:`Julia`}),(0,g.jsx)(s,{color:y===`newton`?`primary`:`default`,fill:y===`newton`?`solid`:`outline`,onClick:()=>G(`newton`),size:`small`,children:`Newton`})]}),(0,g.jsx)(`p`,{className:`fractal-note`,children:y===`newton`?`Newton 模式把切线迭代推广到复平面 z^${z} - 1，颜色表示最终收敛到的根。`:`混沌系统常会产生分形结构，但不是任何混沌轨迹都天然呈现分形；这里用复平面迭代的逃逸时间集合来做可视化。`}),U?(0,g.jsxs)(`div`,{className:`fractal-controls`,children:[(0,g.jsx)(b,{label:`Zoom`,max:360,min:.3,onChange:A,step:.1,value:k}),(0,g.jsx)(b,{label:`Iterations`,max:420,min:48,onChange:O,step:4,value:D}),(0,g.jsx)(b,{label:`Color`,max:1,min:0,onChange:R,step:.01,value:L}),y===`julia`?(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)(b,{label:`Julia real`,max:1,min:-1,onChange:P,step:.01,value:N}),(0,g.jsx)(b,{label:`Julia imag`,max:1,min:-1,onChange:I,step:.01,value:F}),(0,g.jsxs)(`div`,{className:`fractal-switch-row`,children:[(0,g.jsx)(`span`,{children:`Animate seed`}),(0,g.jsx)(a,{checked:V,onChange:H})]})]}):null,y===`newton`?(0,g.jsx)(b,{label:`Degree`,max:9,min:3,onChange:B,step:1,value:z}):null]}):null,(0,g.jsxs)(o,{block:!0,wrap:!0,children:[(0,g.jsx)(s,{fill:`outline`,onClick:()=>G(),size:`small`,children:`Reset view`}),(0,g.jsx)(s,{fill:`outline`,onClick:()=>{A(C(k*1.8,.28,360))},size:`small`,children:`Zoom in`}),(0,g.jsxs)(`span`,{className:`fractal-stat`,children:[j.x.toFixed(3),`, `,j.y.toFixed(3)]})]})]})]})}function b({label:e,max:n,min:r,onChange:i,step:a,value:o}){return(0,g.jsxs)(`div`,{className:`control-slider`,children:[(0,g.jsxs)(`span`,{children:[e,(0,g.jsx)(`strong`,{children:D(o,a)})]}),(0,g.jsx)(t,{max:n,min:r,onChange:e=>i(S(e)),step:a,value:o})]})}function x(e,t,n,r,i){let a=n.width/Math.max(n.height,1),o=(e-n.left)/Math.max(n.width,1)*2-1,s=1-(t-n.top)/Math.max(n.height,1)*2;return new d(r.x+o*a/i,r.y+s/i)}function S(e){return Array.isArray(e)?e[0]:e}function C(e,t,n){return Math.min(n,Math.max(t,e))}function w(e){return e===`julia`?1:e===`newton`?2:0}function T(e){return e===`julia`?1.55:e===`newton`?.82:1.1}function E(e){return e===`mandelbrot`?new d(-.58,0):new d(0,0)}function D(e,t){return t<1?e.toFixed(2):String(e)}export{y as component};