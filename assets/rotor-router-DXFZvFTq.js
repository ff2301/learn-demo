import{_ as e,i as t,l as n,m as r,p as i,s as a,u as o}from"./index-k7PFuL3V.js";var s=e(r()),c=i(),l=16,u=4e3,d=8,f=d*4,p={copyDst:8,copySrc:4,mapRead:1,storage:128,uniform:64},m={read:1},h=`
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
`,g=`
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
`;function _(){let e=(0,s.useRef)(null),t=(0,s.useRef)({gridSize:768,headCount:l,paused:!1,resetNonce:1,stepsPerHead:u}),[r,i]=(0,s.useState)(768),[_,y]=(0,s.useState)(l),[b,x]=(0,s.useState)(u),[S,C]=(0,s.useState)(!1),[w,T]=(0,s.useState)(()=>window.innerWidth>760),[E,D]=(0,s.useState)(1),[O,k]=(0,s.useState)({cells:`768 x 768`,escapes:0,heads:l,resolution:`0 x 0`,running:!0,steps:0,stepsPerSecond:0,webgpuReady:!0});return(0,s.useEffect)(()=>{t.current={gridSize:r,headCount:_,paused:S,resetNonce:E,stepsPerHead:b}},[r,_,S,E,b]),(0,s.useEffect)(()=>{let n=e.current;if(!n)return;let r=n,i=!1,a=0,o=null,s=null,c=null,l=null,u=null,_=null,v=null,y=null,b=null,x=null,S=null,C=null,w=0,T=0,E=0,D=0,O=performance.now(),A=0,j=!1;async function M(){if(!navigator.gpu){k(e=>({...e,running:!1,webgpuReady:!1}));return}let e=await navigator.gpu.requestAdapter({powerPreference:`high-performance`});if(!e||i){k(e=>({...e,running:!1,webgpuReady:!1}));return}if(S=await e.requestDevice(),i){S.destroy();return}if(x=r.getContext(`webgpu`),!x){k(e=>({...e,running:!1,webgpuReady:!1}));return}C=navigator.gpu.getPreferredCanvasFormat(),x.configure({alphaMode:`opaque`,device:S,format:C});let t=S.createShaderModule({code:h}),n=S.createShaderModule({code:g});y=S.createComputePipeline({layout:`auto`,compute:{entryPoint:`main`,module:t}}),b=S.createRenderPipeline({layout:`auto`,fragment:{entryPoint:`fragment_main`,module:n,targets:[{format:C}]},primitive:{topology:`triangle-list`},vertex:{entryPoint:`vertex_main`,module:n}}),F(),z()}function N(e){return new Uint32Array(e*e)}function P(){o?.destroy(),s?.destroy(),c?.destroy(),l?.destroy(),u?.destroy(),o=null,s=null,c=null,l=null,u=null,_=null,v=null,j=!1}function F(){if(!S||!y||!b)return;let{gridSize:e,headCount:n,resetNonce:r}=t.current;P();let i=N(e);o=S.createBuffer({mappedAtCreation:!0,size:i.byteLength,usage:p.storage|p.copyDst}),new Uint32Array(o.getMappedRange()).set(i),o.unmap();let a=new Uint32Array(n*d);for(let t=0;t<n;t+=1){let n=t*d;a[n]=e>>1,a[n+1]=e>>1,a[n+2]=r*65537+t*2654435761>>>0,a[n+5]=0}s=S.createBuffer({mappedAtCreation:!0,size:a.byteLength,usage:p.copySrc|p.storage}),new Uint32Array(s.getMappedRange()).set(a),s.unmap(),c=S.createBuffer({size:32,usage:p.copyDst|p.uniform}),l=S.createBuffer({size:32,usage:p.copyDst|p.uniform}),u=S.createBuffer({size:a.byteLength,usage:p.copyDst|p.mapRead}),_=S.createBindGroup({entries:[{binding:0,resource:{buffer:o}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:c}}],layout:y.getBindGroupLayout(0)}),v=S.createBindGroup({entries:[{binding:0,resource:{buffer:o}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:l}}],layout:b.getBindGroupLayout(0)}),w=e,T=n,E=r,D=0,O=performance.now(),k(r=>({...r,cells:`${e.toLocaleString()} x ${e.toLocaleString()}`,escapes:0,heads:n,running:!t.current.paused,steps:0,stepsPerSecond:0,webgpuReady:!0}))}function I(){let e=r.getBoundingClientRect(),t=Math.min(window.devicePixelRatio,2),n=Math.max(1,Math.floor(e.width*t)),i=Math.max(1,Math.floor(e.height*t));return(r.width!==n||r.height!==i)&&(r.width=n,r.height=i),{height:i,width:n}}function L(e,n,r){if(!S||!c||!l)return;let i=t.current,a=new Uint32Array([i.gridSize,i.gridSize,i.stepsPerHead,i.resetNonce,i.headCount,0,0,0]),o=new Float32Array([i.gridSize,i.gridSize,e,n,r/1e3,i.headCount,0,0]);S.queue.writeBuffer(c,0,a),S.queue.writeBuffer(l,0,o)}function R(){if(!S||!s||!u||j)return;j=!0;let e=S.createCommandEncoder();e.copyBufferToBuffer(s,0,u,0,T*f),S.queue.submit([e.finish()]),u.mapAsync(m.read).then(()=>{if(!u||i)return;let e=new Uint32Array(u.getMappedRange().slice(0));u.unmap(),j=!1;let n=0,a=0;for(let t=0;t<T;t+=1){let r=t*d;n+=e[r+3],a+=e[r+4]}let o=performance.now(),s=Math.max(1,o-O),c=Math.round((n-D)*1e3/s);D=n,O=o,k({cells:`${w.toLocaleString()} x ${w.toLocaleString()}`,escapes:a,heads:T,resolution:`${r.width} x ${r.height}`,running:!t.current.paused,steps:n,stepsPerSecond:c,webgpuReady:!0})}).catch(()=>{j=!1})}function z(){if(i||!S||!x||!y||!b)return;if((w!==t.current.gridSize||T!==t.current.headCount||E!==t.current.resetNonce)&&F(),!o||!s||!_||!v||!c||!l){a=requestAnimationFrame(z);return}let e=performance.now(),{height:n,width:r}=I();L(r,n,e);let u=S.createCommandEncoder();if(!t.current.paused){let e=u.beginComputePass();e.setPipeline(y),e.setBindGroup(0,_),e.dispatchWorkgroups(t.current.headCount),e.end()}let d=x.getCurrentTexture().createView(),f=u.beginRenderPass({colorAttachments:[{clearValue:{a:1,b:.03,g:.02,r:.01},loadOp:`clear`,storeOp:`store`,view:d}]});f.setPipeline(b),f.setBindGroup(0,v),f.draw(3),f.end(),S.queue.submit([u.finish()]),e-A>220&&(A=e,R()),a=requestAnimationFrame(z)}return M(),()=>{i=!0,cancelAnimationFrame(a),P(),S?.destroy()}},[]),(0,c.jsxs)(`section`,{className:`rotor-demo`,children:[(0,c.jsx)(`canvas`,{"aria-label":`Rotor-router WebGPU simulation`,className:`rotor-canvas`,ref:e}),O.webgpuReady?(0,c.jsx)(n,{className:`rotor-panel${w?``:` collapsed`}`,title:(0,c.jsxs)(`div`,{className:`rotor-panel-header`,children:[(0,c.jsx)(`span`,{children:`Rotor-router field`}),(0,c.jsx)(o,{fill:`none`,onClick:()=>T(e=>!e),size:`small`,children:w?`Hide`:`Show`})]}),children:w?(0,c.jsxs)(`div`,{className:`rotor-controls`,children:[(0,c.jsxs)(`div`,{className:`rotor-stat-grid`,children:[(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Grid`}),(0,c.jsx)(`strong`,{children:O.cells})]}),(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Heads`}),(0,c.jsx)(`strong`,{children:O.heads.toLocaleString()})]}),(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Steps`}),(0,c.jsx)(`strong`,{children:O.steps.toLocaleString()})]}),(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Escapes`}),(0,c.jsx)(`strong`,{children:O.escapes.toLocaleString()})]}),(0,c.jsxs)(`div`,{children:[(0,c.jsx)(`span`,{children:`Speed`}),(0,c.jsxs)(`strong`,{children:[O.stepsPerSecond.toLocaleString(),`/s`]})]})]}),(0,c.jsx)(v,{label:`Grid width`,max:1536,min:256,onChange:i,step:128,value:r}),(0,c.jsx)(v,{label:`Heads`,max:128,min:1,onChange:y,step:1,value:_}),(0,c.jsx)(v,{label:`Steps / head / frame`,max:2e4,min:500,onChange:x,step:500,value:b}),(0,c.jsxs)(a,{block:!0,wrap:!0,children:[(0,c.jsx)(o,{color:`primary`,onClick:()=>C(e=>!e),children:S?`Run`:`Pause`}),(0,c.jsx)(o,{onClick:()=>D(e=>e+1),children:`Reset`})]}),(0,c.jsxs)(`div`,{className:`rotor-status${O.running?` running`:``}`,children:[O.running?`Running`:`Paused`,` · `,O.resolution]})]}):(0,c.jsxs)(`div`,{className:`rotor-status${O.running?` running`:``}`,children:[O.stepsPerSecond.toLocaleString(),`/s`]})}):(0,c.jsx)(n,{className:`rotor-panel`,title:`WebGPU required`,children:(0,c.jsx)(`p`,{className:`rotor-note`,children:`This demo needs a browser with WebGPU enabled, such as current Chrome or Edge.`})})]})}function v({label:e,max:n,min:r,onChange:i,step:a,value:o}){return(0,c.jsxs)(`div`,{className:`control-slider`,children:[(0,c.jsxs)(`span`,{children:[e,(0,c.jsx)(`strong`,{children:o.toLocaleString()})]}),(0,c.jsx)(t,{max:n,min:r,onChange:e=>{typeof e==`number`&&i(e)},step:a,value:o})]})}export{_ as component};