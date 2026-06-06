import{_ as e,i as t,l as n,m as r,p as i,s as a,u as o}from"./index-Ba3rQlt4.js";var s=e(r()),c=i(),l={copyDst:8,copySrc:4,mapRead:1,storage:128,uniform:64},u={read:1},d=`
struct SimParams {
  width: u32,
  height: u32,
  steps_per_dispatch: u32,
  nonce: u32,
};

struct Walker {
  x: u32,
  y: u32,
  seed: u32,
  steps: u32,
  escapes: u32,
  nonce: u32,
};

@group(0) @binding(0) var<storage, read_write> board: array<u32>;
@group(0) @binding(1) var<storage, read_write> walker: Walker;
@group(0) @binding(2) var<uniform> params: SimParams;

fn hash(value: u32) -> u32 {
  var x = value;
  x = ((x >> 16u) ^ x) * 0x7feb352du;
  x = ((x >> 15u) ^ x) * 0x846ca68bu;
  return (x >> 16u) ^ x;
}

fn respawn(seed: u32) -> vec2<u32> {
  let next = hash(seed + walker.escapes * 747796405u + walker.steps * 2891336453u);
  return vec2<u32>(next % params.width, (next / params.width) % params.height);
}

@compute @workgroup_size(1)
fn main() {
  if (walker.nonce != params.nonce) {
    walker.x = params.width / 2u;
    walker.y = params.height / 2u;
    walker.seed = hash(params.nonce + params.width * 4099u + params.height * 131u);
    walker.steps = 0u;
    walker.escapes = 0u;
    walker.nonce = params.nonce;
  }

  var x = walker.x;
  var y = walker.y;

  for (var i = 0u; i < params.steps_per_dispatch; i = i + 1u) {
    if (x >= params.width || y >= params.height) {
      let start = respawn(walker.seed + i);
      x = start.x;
      y = start.y;
    }

    let index = y * params.width + x;
    let value = board[index];
    let direction = (value + 1u) & 3u;
    let visits = min((value >> 2u) + 1u, 0x3fffffffu);
    board[index] = (visits << 2u) | direction;
    walker.steps = walker.steps + 1u;

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
      walker.escapes = walker.escapes + 1u;
      let start = respawn(walker.seed + i + 17u);
      x = start.x;
      y = start.y;
    } else {
      x = u32(nx);
      y = u32(ny);
    }
  }

  walker.x = x;
  walker.y = y;
}
`,f=`
struct RenderParams {
  grid_width: f32,
  grid_height: f32,
  canvas_width: f32,
  canvas_height: f32,
  time: f32,
  pad0: f32,
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
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
};

@group(0) @binding(0) var<storage, read> board: array<u32>;
@group(0) @binding(1) var<storage, read> walker: Walker;
@group(0) @binding(2) var<uniform> params: RenderParams;

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

  let walker_delta = vec2<f32>(cell) - vec2<f32>(f32(walker.x), f32(walker.y));
  let walker_distance = length(walker_delta);
  let marker = smoothstep(4.0, 0.0, walker_distance);
  color = mix(color, vec3<f32>(1.0, 0.98, 0.82), marker * 0.78);

  if (cell_size > 4.0) {
    let cell_uv = fract(local / cell_size);
    let line = step(cell_uv.x, 0.035) + step(cell_uv.y, 0.035);
    color *= 1.0 - min(line, 1.0) * 0.18;
  }

  return vec4<f32>(pow(color, vec3<f32>(0.78)), 1.0);
}
`;function p(){let e=(0,s.useRef)(null),t=(0,s.useRef)({gridSize:768,paused:!1,resetNonce:1,stepsPerFrame:24e3}),[r,i]=(0,s.useState)(768),[p,h]=(0,s.useState)(24e3),[g,_]=(0,s.useState)(!1),[v,y]=(0,s.useState)(()=>window.innerWidth>760),[b,x]=(0,s.useState)(1),[S,C]=(0,s.useState)({cells:`768 x 768`,escapes:0,resolution:`0 x 0`,running:!0,steps:0,stepsPerSecond:0,webgpuReady:!0});return(0,s.useEffect)(()=>{t.current={gridSize:r,paused:g,resetNonce:b,stepsPerFrame:p}},[r,g,b,p]),(0,s.useEffect)(()=>{let n=e.current;if(!n)return;let r=n,i=!1,a=0,o=null,s=null,c=null,p=null,m=null,h=null,g=null,_=null,v=null,y=null,b=null,x=null,S=0,w=0,T=0,E=performance.now(),D=0,O=!1;async function k(){if(!navigator.gpu){C(e=>({...e,running:!1,webgpuReady:!1}));return}let e=await navigator.gpu.requestAdapter({powerPreference:`high-performance`});if(!e||i){C(e=>({...e,running:!1,webgpuReady:!1}));return}if(b=await e.requestDevice(),i){b.destroy();return}if(y=r.getContext(`webgpu`),!y){C(e=>({...e,running:!1,webgpuReady:!1}));return}x=navigator.gpu.getPreferredCanvasFormat(),y.configure({alphaMode:`opaque`,device:b,format:x});let t=b.createShaderModule({code:d}),n=b.createShaderModule({code:f});_=b.createComputePipeline({layout:`auto`,compute:{entryPoint:`main`,module:t}}),v=b.createRenderPipeline({layout:`auto`,fragment:{entryPoint:`fragment_main`,module:n,targets:[{format:x}]},primitive:{topology:`triangle-list`},vertex:{entryPoint:`vertex_main`,module:n}}),M(),I()}function A(e,t){let n=e*e,r=new Uint32Array(n),i=(e-1)*.5;for(let n=0;n<e;n+=1)for(let a=0;a<e;a+=1){let o=a-i,s=n-i,c=Math.floor((Math.atan2(s,o)+Math.PI)/(Math.PI*2)*4+t)&3,l=(a*73856093^n*19349663^t*83492791)&3;r[n*e+a]=c+l&3}return r}function j(){o?.destroy(),s?.destroy(),c?.destroy(),p?.destroy(),m?.destroy(),o=null,s=null,c=null,p=null,m=null,h=null,g=null,O=!1}function M(){if(!b||!_||!v)return;let{gridSize:e,resetNonce:n}=t.current;j();let r=A(e,n);o=b.createBuffer({mappedAtCreation:!0,size:r.byteLength,usage:l.storage|l.copyDst}),new Uint32Array(o.getMappedRange()).set(r),o.unmap();let i=new Uint32Array([e>>1,e>>1,n*65537,0,0,n]);s=b.createBuffer({mappedAtCreation:!0,size:32,usage:l.copySrc|l.storage}),new Uint32Array(s.getMappedRange()).set(i),s.unmap(),c=b.createBuffer({size:16,usage:l.copyDst|l.uniform}),p=b.createBuffer({size:32,usage:l.copyDst|l.uniform}),m=b.createBuffer({size:32,usage:l.copyDst|l.mapRead}),h=b.createBindGroup({entries:[{binding:0,resource:{buffer:o}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:c}}],layout:_.getBindGroupLayout(0)}),g=b.createBindGroup({entries:[{binding:0,resource:{buffer:o}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:p}}],layout:v.getBindGroupLayout(0)}),S=e,w=n,T=0,E=performance.now(),C(n=>({...n,cells:`${e.toLocaleString()} x ${e.toLocaleString()}`,escapes:0,running:!t.current.paused,steps:0,stepsPerSecond:0,webgpuReady:!0}))}function N(){let e=r.getBoundingClientRect(),t=Math.min(window.devicePixelRatio,2),n=Math.max(1,Math.floor(e.width*t)),i=Math.max(1,Math.floor(e.height*t));return(r.width!==n||r.height!==i)&&(r.width=n,r.height=i),{height:i,width:n}}function P(e,n,r){if(!b||!c||!p)return;let i=t.current,a=new Uint32Array([i.gridSize,i.gridSize,i.stepsPerFrame,i.resetNonce]),o=new Float32Array([i.gridSize,i.gridSize,e,n,r/1e3,0,0,0]);b.queue.writeBuffer(c,0,a),b.queue.writeBuffer(p,0,o)}function F(){if(!b||!s||!m||O)return;O=!0;let e=b.createCommandEncoder();e.copyBufferToBuffer(s,0,m,0,32),b.queue.submit([e.finish()]),m.mapAsync(u.read).then(()=>{if(!m||i)return;let e=new Uint32Array(m.getMappedRange().slice(0));m.unmap(),O=!1;let n=performance.now(),a=Math.max(1,n-E),o=Math.round((e[3]-T)*1e3/a);T=e[3],E=n,C({cells:`${S.toLocaleString()} x ${S.toLocaleString()}`,escapes:e[4],resolution:`${r.width} x ${r.height}`,running:!t.current.paused,steps:e[3],stepsPerSecond:o,webgpuReady:!0})}).catch(()=>{O=!1})}function I(){if(i||!b||!y||!_||!v)return;if((S!==t.current.gridSize||w!==t.current.resetNonce)&&M(),!o||!s||!h||!g||!c||!p){a=requestAnimationFrame(I);return}let e=performance.now(),{height:n,width:r}=N();P(r,n,e);let l=b.createCommandEncoder();if(!t.current.paused){let e=l.beginComputePass();e.setPipeline(_),e.setBindGroup(0,h),e.dispatchWorkgroups(1),e.end()}let u=y.getCurrentTexture().createView(),d=l.beginRenderPass({colorAttachments:[{clearValue:{a:1,b:.03,g:.02,r:.01},loadOp:`clear`,storeOp:`store`,view:u}]});d.setPipeline(v),d.setBindGroup(0,g),d.draw(3),d.end(),b.queue.submit([l.finish()]),e-D>220&&(D=e,F()),a=requestAnimationFrame(I)}return k(),()=>{i=!0,cancelAnimationFrame(a),j(),b?.destroy()}},[]),(0,c.jsxs)(`section`,{className:`rotor-demo`,children:[(0,c.jsx)(`canvas`,{"aria-label":`Rotor-router WebGPU simulation`,className:`rotor-canvas`,ref:e}),S.webgpuReady?(0,c.jsx)(n,{className:`rotor-panel${v?``:` collapsed`}`,title:(0,c.jsxs)(`div`,{className:`rotor-panel-header`,children:[(0,c.jsx)(`span`,{children:`Rotor-router field`}),(0,c.jsx)(o,{fill:`none`,onClick:()=>y(e=>!e),size:`small`,children:v?`Hide`:`Show`})]}),children:v?(0,c.jsxs)(`div`,{className:`rotor-controls`,children:[(0,c.jsxs)(`div`,{className:`rotor-stat-grid`,children:[(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Grid`}),(0,c.jsx)(`strong`,{children:S.cells})]}),(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Steps`}),(0,c.jsx)(`strong`,{children:S.steps.toLocaleString()})]}),(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Escapes`}),(0,c.jsx)(`strong`,{children:S.escapes.toLocaleString()})]}),(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Speed`}),(0,c.jsxs)(`strong`,{children:[S.stepsPerSecond.toLocaleString(),`/s`]})]})]}),(0,c.jsx)(m,{label:`Grid width`,max:1536,min:256,onChange:i,step:128,value:r}),(0,c.jsx)(m,{label:`GPU steps per frame`,max:8e4,min:2e3,onChange:h,step:2e3,value:p}),(0,c.jsxs)(a,{block:!0,wrap:!0,children:[(0,c.jsx)(o,{color:`primary`,onClick:()=>_(e=>!e),children:g?`Run`:`Pause`}),(0,c.jsx)(o,{onClick:()=>x(e=>e+1),children:`Reseed`})]}),(0,c.jsxs)(`div`,{className:`rotor-status${S.running?` running`:``}`,children:[S.running?`Running`:`Paused`,` · `,S.resolution]})]}):(0,c.jsxs)(`div`,{className:`rotor-status${S.running?` running`:``}`,children:[S.stepsPerSecond.toLocaleString(),`/s`]})}):(0,c.jsx)(n,{className:`rotor-panel`,title:`WebGPU required`,children:(0,c.jsx)(`p`,{className:`rotor-note`,children:`This demo needs a browser with WebGPU enabled, such as current Chrome or Edge.`})})]})}function m({label:e,max:n,min:r,onChange:i,step:a,value:o}){return(0,c.jsxs)(`div`,{className:`control-slider`,children:[(0,c.jsxs)(`span`,{children:[e,(0,c.jsx)(`strong`,{children:o.toLocaleString()})]}),(0,c.jsx)(t,{max:n,min:r,onChange:e=>{typeof e==`number`&&i(e)},step:a,value:o})]})}export{p as component};