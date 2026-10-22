/* Park3D — real-time model of the swamp park in Arkhangelsk (three.js r187, WebGL2).
   Geometry, trees and materials come from the same generators as the path-traced renders (park_geo.json + park.bin).
   Plan coordinates: x east, y south; three.js: X = x, Y = height, Z = y. */
(function (global) {
'use strict';
const T = global.THREE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const STAGES = 8;
const DECID = { birch: 1, alder: 1, willow: 1, rowan: 1, cherry: 1, apple: 1, larch: 1, S_spi: 1, S_cor: 1, S_ros: 1, S_vib: 1, S_lon: 1, S_bn: 1, S_bc: 1 };
const AUTUMN = { birch: 0xe0b23a, alder: 0x9a8a3a, willow: 0xc8b84a, rowan: 0xd0502a, cherry: 0xc8702a, apple: 0xd09a3a, larch: 0xe6a83a,
  S_spi: 0xd07a3a, S_cor: 0xb03a3a, S_ros: 0xd0903a, S_vib: 0xc0402a, S_lon: 0xb0903a, S_bn: 0xd04a2a, S_bc: 0xe0a03a };

/* shared asset loading (the plant catalogue reuses the same prototypes) */
const ASSETS = {};
function loadAssets(base) {
  base = base || '';
  if (!ASSETS[base]) ASSETS[base] = Promise.all([
    fetch(base + 'park_geo.json').then(r => { if (!r.ok) throw new Error('park_geo.json'); return r.json(); }),
    loadBin(base)]).then(([man, bin]) => ({ man, bin }));
  return ASSETS[base];
}
// geometry buffer: park.bin, or (where binary files are not served) the same bytes gzipped and base64-encoded as text
function loadBin(base) {
  return fetch(base + 'park.bin').then(r => { if (!r.ok) throw new Error('park.bin'); return r.arrayBuffer(); })
    .catch(() => fetch(base + 'park_bin.gz.b64.txt').then(r => { if (!r.ok) throw new Error('park_bin.gz.b64.txt'); return r.text(); }).then(t => {
      const s = atob(t.trim()), u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }));
}
function decodeGeom(man, bin, name) {
  const d = man.meshes[name]; if (!d) return null;
  const n = d.n, q = new Int16Array(bin, d.pos, n * 3), pos = new Float32Array(n * 3), lo = d.lo, sc = d.sc;
  for (let i = 0; i < n; i++) { const o = i * 3; pos[o] = lo[0] + (q[o] + 32768) / 65535 * sc[0]; pos[o + 1] = lo[1] + (q[o + 1] + 32768) / 65535 * sc[1]; pos[o + 2] = lo[2] + (q[o + 2] + 32768) / 65535 * sc[2]; }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(new Int8Array(bin, d.nrm, n * 3), 3, true));
  if (d.uv != null) g.setAttribute('uv', new T.Float16BufferAttribute(new Uint16Array(bin, d.uv, n * 2), 2));
  g.setIndex(new T.BufferAttribute(d.ib === 2 ? new Uint16Array(bin, d.idx, d.ni) : new Uint32Array(bin, d.idx, d.ni), 1));
  g.computeBoundingSphere();
  return g;
}

class Park3D {
  constructor(el, M, opts) {
    this.el = el; this.M = M; this.opts = opts = opts || {};
    this.base = opts.base || '';
    this.env = { season: 0, tod: 0 }; this.show = { trees: true, water: true, labels: true, zones: false, paths: true };
    this.sv = 7; this.dirty = true; this.paused = false; this.eyeMode = false; this.flowerScale = 1;
    this.walkObstacles = []; this.walkPlatforms = [];
    this.quality = opts.quality || (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'low' : 'high');
    const R = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.still });
    R.setPixelRatio(Math.min(global.devicePixelRatio || 1, this.quality === 'low' ? 1.25 : 1.6));
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFShadowMap;
    R.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';
    R.domElement.tabIndex = 0;
    el.appendChild(R.domElement);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(42, 1, 0.5, 6000);
    this.controls = new T.OrbitControls(this.camera, R.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08; this.controls.maxPolarAngle = 1.48;
    this.controls.minDistance = 4; this.controls.maxDistance = 1400;
    this.controls.addEventListener('change', () => { this.dirty = true; this.shadowDirty = true; this.lodDirty = true; });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(el);
    this.ready = this._init().catch(e => { console.error(e); throw e; });
  }

  /* ------------------------------------------------------------------ loading */
  async _init() {
    const { man, bin } = await loadAssets(this.base);
    this.man = man; this.bin = bin;
    this.loadMgr = new T.LoadingManager();
    this._texPending = 0;
    this._texDone = new Promise(res => { this._texRes = res; });
    this.loadMgr.onLoad = () => { this.dirty = true; if (this._texRes) this._texRes(); };
    this.texLoader = new T.TextureLoader(this.loadMgr);
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    await this._sky();
    this._lights();
    this._terrain();
    this._ground();
    this._water();
    this._arch();
    this._furniture();
    this._pools();
    this._trees();
    this._low();
    this._context();
    this._fence();
    this._scrub();
    this._pois();
    this._post();
    this.setCameraPreset('iso', false);
    this.applyEnv(); this.applyState(true);
    if (this._texPending > 0) await Promise.race([new Promise(r => { this._texWait = r; }), new Promise(r => setTimeout(r, 30000))]);
    this._impostors();          // the atlas is drawn from the loaded leaf textures
    if (this._texPending > 0) this._texWait = () => { this._texWait = null; this._rebuildImpostors(); };   // slow network: redraw once all are in
    this.lodDirty = true; this.updateTrees(true);
    this.dirty = true;
    this._loop = this.loop.bind(this);
    this.clock = new T.Timer ? null : null; this._tPrev = performance.now();
    requestAnimationFrame(this._loop);
    return this;
  }

  geom(name) {
    this._gcache = this._gcache || {};
    if (this._gcache[name]) return this._gcache[name];
    const g = this._geom(name); this._gcache[name] = g; return g;
  }
  _geom(name) { return decodeGeom(this.man, this.bin, name); }
  worldUV(g, k) {    // uv from world x,z (metres)
    const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = p.getX(i) * (k || 1); uv[i * 2 + 1] = p.getZ(i) * (k || 1); }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2)); return g;
  }
  tex(src, opt) {
    opt = opt || {};
    this._texPending = (this._texPending || 0) + 1;
    const done = () => { this._texPending--; this.dirty = true; if (this._texPending <= 0 && this._texWait) this._texWait(); };
    const t = this.texLoader.load(this.base + src, done, undefined, done);
    t.wrapS = t.wrapT = opt.clamp ? T.ClampToEdgeWrapping : T.RepeatWrapping;
    t.colorSpace = opt.linear ? T.NoColorSpace : T.SRGBColorSpace;
    t.anisotropy = Math.min(8, this.maxAniso);
    if (opt.repeat) t.repeat.set(opt.repeat[0], opt.repeat[1]);
    return t;
  }
  texKey(key, extraRepeat) {
    const d = this.man.textures[key]; if (!d) return null;
    const s = d.size || 1, sx = Array.isArray(s) ? s[0] : s, sy = Array.isArray(s) ? s[1] : s;
    const t = this.tex(d.src, { repeat: [1 / sx * (extraRepeat || 1), 1 / sy * (extraRepeat || 1)], clamp: !!d.clamp });
    if (d.x0 !== undefined) t.offset.set(-d.x0 / sx, -d.y0 / sy);
    return t;
  }

  async _sky() {
    const t = await this.texLoader.loadAsync(this.base + 'tex/sky.jpg');
    t.mapping = T.EquirectangularReflectionMapping; t.colorSpace = T.SRGBColorSpace;
    this.skyTex = t;
    this.scene.background = t;
    this.scene.backgroundIntensity = 1.0;
    const pm = new T.PMREMGenerator(this.renderer);
    this.envMap = pm.fromEquirectangular(t).texture; pm.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;
    this.fogColor = new T.Color(0xc4d2de);
    this.scene.fog = new T.FogExp2(this.fogColor.clone(), 0.00055);
  }
  _lights() {
    const s = this.man.sun;
    this.sunDir = new T.Vector3(s[0], s[1], s[2]).normalize();
    const L = this.sun = new T.DirectionalLight(0xfff1dc, 3.1);
    L.castShadow = true;
    const ms = this.quality === 'low' ? 2048 : 4096;
    L.shadow.mapSize.set(ms, ms); L.shadow.bias = -0.0004; L.shadow.normalBias = 0.6;
    L.shadow.camera.near = 1; L.shadow.camera.far = 2000;
    this.scene.add(L); this.scene.add(L.target);
    this.hemi = new T.HemisphereLight(0xcfe0ff, 0x4a5a32, 0.35); this.scene.add(this.hemi);
  }

  /* ------------------------------------------------------------------ terrain grid with splat shading and stage morph */
  _terrain() {
    const t = this.man.terrain, nx = t.nx, ny = t.ny;
    const h1h = new Uint16Array(this.bin, t.h1, nx * ny), h0h = new Uint16Array(this.bin, t.h0, nx * ny);
    const h1 = new Float32Array(nx * ny), h0 = new Float32Array(nx * ny), F = T.DataUtils.fromHalfFloat;
    for (let i = 0; i < nx * ny; i++) { h1[i] = F(h1h[i]); h0[i] = F(h0h[i]); }
    this.H1 = h1; this.H0 = h0; this.T = t;
    const pos = new Float32Array(nx * ny * 3), a0 = new Float32Array(nx * ny), uv = new Float32Array(nx * ny * 2), suv = new Float32Array(nx * ny * 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = t.x0 + i * t.res, z = t.y0 + j * t.res;
      pos[k * 3] = x; pos[k * 3 + 1] = h1[k]; pos[k * 3 + 2] = z; a0[k] = h0[k];
      uv[k * 2] = x; uv[k * 2 + 1] = z; suv[k * 2] = i / (nx - 1); suv[k * 2 + 1] = j / (ny - 1);
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6); let o = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('h0', new T.BufferAttribute(a0, 1));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('suv', new T.BufferAttribute(suv, 2));
    g.setIndex(new T.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const k = (key) => { const d = this.man.textures[key]; return this.tex(d.src, {}); };
    const U = this.terrU = { uMorph: { value: 1 }, uFill: { value: 1 }, uBare: { value: 0 }, uSwamp: { value: 0 }, uSnow: { value: 0 }, uAutumn: { value: 0 },
      tLawn: { value: k('lawn') }, tMeadow: { value: k('meadow') }, tWet: { value: k('grass_wet') }, tMud: { value: k('mud') },
      tSplat: { value: this.tex('tex/splat.png', { clamp: true }) } };
    U.tSplat.value.colorSpace = T.NoColorSpace; U.tSplat.value.flipY = false;   // row 0 of the PNG = north edge (y0)
    const sizes = { lawn: 3, meadow: 4, wet: 3, mud: 2 };
    const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float h0; attribute vec2 suv; uniform float uMorph, uFill; varying vec2 vW; varying vec2 vS; varying float vFill;')
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); float dh = position.y - h0; transformed.y = h0 + min(dh, 0.0) * uMorph + max(dh, 0.0) * uFill; vFill = max(dh, 0.0) * uFill; vW = position.xz; vS = suv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tLawn, tMeadow, tWet, tMud, tSplat; uniform float uBare, uSwamp, uSnow, uAutumn; varying vec2 vW; varying vec2 vS; varying float vFill;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }`)
        .replace('#include <map_fragment>', `
vec4 sw = vec4(texture2D(tSplat, vS).rgb, 0.0); sw.a = clamp(1.0 - sw.r - sw.g - sw.b, 0.0, 1.0);
vec3 cl = texture2D(tLawn, vW / ${sizes.lawn.toFixed(1)}).rgb, cm = texture2D(tMeadow, vW / ${sizes.meadow.toFixed(1)}).rgb;
vec3 cw = texture2D(tWet, vW / ${sizes.wet.toFixed(1)}).rgb, cd = texture2D(tMud, vW / ${sizes.mud.toFixed(1)}).rgb;
float n1 = vnoise(vW * 0.08) * 0.6 + vnoise(vW * 0.31) * 0.4;
vec3 g = cl * sw.r + cm * sw.g + cw * sw.b + cd * sw.a;
g *= 0.86 + 0.24 * n1;
vec3 autumn = mix(g, g * vec3(1.18, 1.02, 0.62) + vec3(0.04, 0.02, 0.0), 0.65);
g = mix(g, autumn, uAutumn);
vec3 peat = mix(vec3(0.20, 0.16, 0.12), vec3(0.32, 0.26, 0.19), n1);
vec3 swamp = mix(cw * vec3(0.95, 1.0, 0.8), mix(peat, vec3(0.42, 0.40, 0.24), 0.4), smoothstep(0.35, 0.7, n1));
vec3 soil = mix(vec3(0.33, 0.28, 0.19), vec3(0.41, 0.35, 0.25), n1);   // imported mineral soil of the berm, hill and raised land
peat = mix(peat, soil, smoothstep(0.12, 0.6, vFill));
g = mix(g, peat, uBare);
g = mix(g, swamp, uSwamp);
g = mix(g, vec3(0.92, 0.95, 1.0), uSnow * (0.75 + 0.25 * n1));
diffuseColor.rgb *= g;`);
    };
    const m = this.terrainMesh = new T.Mesh(g, mat);
    m.receiveShadow = true; this.scene.add(m);
    this.terrain = m;
    // far ground ring (city level) beyond the terrain grid
    const ring = new T.Group();
    const fm = this.farMat = new T.MeshStandardMaterial({ color: 0x6b7d4a, roughness: 1 });
    const x0 = t.x0, z0 = t.y0, x1 = t.x0 + (nx - 1) * t.res, z1 = t.y0 + (ny - 1) * t.res, R = 6000;
    for (const [ax, az, bx, bz] of [[-R, -R, R, z0], [-R, z1, R, R], [-R, z0, x0, z1], [x1, z0, R, z1]]) {
      const pg = new T.PlaneGeometry(bx - ax, bz - az); pg.rotateX(-Math.PI / 2); pg.translate((ax + bx) / 2, 0.9, (az + bz) / 2);
      const mm = new T.Mesh(pg, fm); mm.receiveShadow = true; ring.add(mm);
    }
    this.scene.add(ring);
  }
  gY(x, z) {   // ground height at plan (x, z=y) for the current morph
    const t = this.T; if (!t) return 1;
    const fx = clamp((x - t.x0) / t.res, 0, t.nx - 1.001), fz = clamp((z - t.y0) / t.res, 0, t.ny - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, nx = t.nx;
    const m = this.terrU ? this.terrU.uMorph.value : 1, f = this.terrU ? this.terrU.uFill.value : 1;
    const h = (A) => A[j * nx + i] * (1 - u) * (1 - v) + A[j * nx + i + 1] * u * (1 - v) + A[(j + 1) * nx + i] * (1 - u) * v + A[(j + 1) * nx + i + 1] * u * v;
    const a = h(this.H0), dh = h(this.H1) - a;      // digging (stage 2) and filling (stage 4) are separate steps
    return a + Math.min(dh, 0) * m + Math.max(dh, 0) * f;
  }

  /* ------------------------------------------------------------------ pavings and hard surfaces */
  _ground() {
    const G = this.man.ground, grp = this.groundGroup = new T.Group();
    const pz = this.man.textures.plaza2 ? 'plaza2' : 'pav_plaza', F = this.man.textures.fill_main ? 1 : 0;
    const spec = { plaza: pz, forecourt: pz, pav_main: F ? 'fill_main' : 'pav_main', asphalt: F ? 'fill_serv' : 'asphalt', pav_sec: F ? 'fill_sec' : 'pav_sec',
      run: F ? 'fill_run' : 'rubber_red', gravel: F ? 'fill_trail' : 'gravel',
      rubber: 'rubber_blue', sand: 'sand', concrete: 'concrete', mulch: 'mulch', yard: 'asphalt' };
    for (const [k, name] of Object.entries(G)) {
      if (!name) continue;
      const g = this.worldUV(this.geom(name));
      const mat = new T.MeshStandardMaterial({ map: this.texKey(spec[k]), color: (k === 'plaza' || k === 'forecourt') ? 0xb4b0aa : 0xffffff, roughness: k === 'run' || k === 'rubber' ? 0.9 : 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new T.Mesh(g, mat); m.receiveShadow = true; grp.add(m);
    }
    for (const [k, name] of Object.entries(this.man.ribbons || {})) {      // walks: paving laid along each path
      if (!name) continue;
      const mat = new T.MeshStandardMaterial({ map: this.texKey(k), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const m = new T.Mesh(this.geom(name), mat); m.receiveShadow = true; grp.add(m);
    }
    this.scene.add(grp);
  }
  _water() {
    const wn = this.tex('tex/waternormals.jpg', { linear: true });
    this.waters = [];
    this.man.water.forEach((name, k) => {
      if (!name) return;
      const g = this.geom(name), p = g.attributes.position, lvl = this.man.water_levels[k];
      const pos = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { pos[i * 3] = p.getX(i); pos[i * 3 + 1] = -p.getZ(i); pos[i * 3 + 2] = 0; }
      const g2 = new T.BufferGeometry(); g2.setAttribute('position', new T.BufferAttribute(pos, 3)); g2.setIndex(g.index);
      g2.setAttribute('normal', new T.BufferAttribute(new Float32Array(p.count * 3).map((v, i) => i % 3 === 2 ? 1 : 0), 3));
      g2.computeBoundingSphere();
      let m;
      if (this.quality !== 'low') {
        m = new T.Water(g2, { textureWidth: 1024, textureHeight: 1024, waterNormals: wn, sunDirection: this.sunDir.clone(), sunColor: 0xfff4e0,
          waterColor: 0x16302c, distortionScale: 1.2, fog: true, alpha: 1.0 });
        m.material.uniforms.size.value = 2.4;
        m.material.fragmentShader = m.material.fragmentShader
          .replace('sunColor * diffuseLight * 0.3 + scatter', 'waterColor * diffuseLight * 0.35 + scatter * 0.8')
          .replace('reflectionSample + specularLight', 'reflectionSample * 0.92 + specularLight');
        m.material.needsUpdate = true;
      } else {
        m = new T.Mesh(g2, new T.MeshStandardMaterial({ color: 0x1c3530, roughness: 0.08, metalness: 0.15, envMapIntensity: 1.2 }));
      }
      m.rotation.x = -Math.PI / 2; m.position.y = lvl; m.userData.level = lvl;
      this.scene.add(m); this.waters.push(m);
    });
    this.iceMat = new T.MeshStandardMaterial({ color: 0xdfe8ef, roughness: 0.35, metalness: 0 });
  }

  /* ------------------------------------------------------------------ architecture */
  matFor(name) {
    this._mats = this._mats || {};
    if (this._mats[name]) return this._mats[name];
    const S = (o) => new T.MeshStandardMaterial(o);
    const tk = (k) => this.texKey(k);
    let m;
    switch (name) {
      case 'wood_dark': m = S({ map: tk('wood_dark'), roughness: 0.72 }); break;
      case 'wood_light': m = S({ map: tk('wood_light'), roughness: 0.6 }); break;
      case 'wood_deck': m = S({ map: tk('wood_deck'), roughness: 0.8 }); break;
      case 'metal_dark': m = S({ color: 0x15171a, roughness: 0.42, metalness: 0.55 }); break;
      case 'roof_green': m = S({ color: 0x1f3d2f, roughness: 0.42, metalness: 0.35 }); break;
      case 'gold': m = S({ color: 0xd2a650, roughness: 0.32, metalness: 1.0 }); break;
      case 'glass': m = S({ color: 0x1c2a30, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: 1.6 }); break;
      case 'concrete': m = S({ map: tk('concrete'), roughness: 0.9 }); break;
      case 'panel_white': m = S({ map: tk('panel_white'), roughness: 0.55 }); break;
      case 'granite': m = S({ map: tk('granite'), roughness: 0.75 }); break;
      case 'rubber_blue': m = S({ map: tk('rubber_blue'), roughness: 0.9 }); break;
      case 'rubber_red': m = S({ map: tk('rubber_red'), roughness: 0.9 }); break;
      case 'rope': m = S({ color: 0x8c6e48, roughness: 0.95 }); break;
      case 'fabric_white': m = S({ color: 0xe6e3dc, roughness: 0.9, side: T.DoubleSide }); break;
      case 'terracotta': m = S({ map: tk('terracotta'), roughness: 0.8 }); break;
      case 'paint_white': m = S({ color: 0xd8d5ce, roughness: 0.7 }); break;
      case 'sand': m = S({ map: tk('sand'), roughness: 1 }); break;
      case 'mesh': m = S({ color: 0x111214, roughness: 0.6, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }); break;
      case 'emit_warm': m = S({ color: 0xf2e2c0, roughness: 0.5, emissive: 0xffc77a, emissiveIntensity: 0 }); this.warmMat = m; break;
      case 'water': m = S({ color: 0x2c4d4a, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.3 }); break;
      case 'g_asphalt': m = S({ map: tk('asphalt'), roughness: 0.9 }); break;
      case 'g_pav_main': m = S({ map: tk('pav_main'), roughness: 0.85 }); break;
      case 'city_roof': m = S({ color: 0x3c3d3f, roughness: 0.9 }); break;
      case 'larch': m = S({ map: tk('larch'), roughness: 0.62 }); break;
      case 'conc_white': m = S({ map: tk('concrete'), color: new T.Color(1.32, 1.32, 1.3), roughness: 0.75 }); break;
      case 'plaster': m = S({ map: tk('concrete'), color: new T.Color(1.4, 1.39, 1.35), roughness: 0.9 }); break;
      case 'sedum': m = S({ map: tk('moss'), roughness: 0.95 }); break;
      case 'glass_thin': m = S({ color: 0x24343a, roughness: 0.03, metalness: 0.25, transparent: true, opacity: 0.42, envMapIntensity: 1.6, side: T.DoubleSide, depthWrite: false }); break;
      case 'lemekh': m = S({ map: tk('lemekh'), roughness: 0.85 }); break;
      case 'log': m = S({ map: tk('log'), roughness: 0.82 }); break;
      case 'silver': m = S({ map: tk('silver'), roughness: 0.82 }); break;
      case 'mezen': m = S({ map: tk('mezen'), roughness: 0.6 }); break;
      case 'steel_brushed': m = S({ color: 0xb9bdc2, roughness: 0.28, metalness: 1.0, side: T.DoubleSide }); break;
      default:
        if (name.startsWith('city_fac_')) { m = S({ map: tk(name.slice(5)), roughness: 0.85 }); break; }
        m = S({ color: 0x8a8a8a, roughness: 0.8 });
    }
    this._mats[name] = m; return m;
  }
  _arch() {
    const grp = this.structures = new T.Group();
    for (const [mat, name] of Object.entries(this.man.arch)) {
      if (!name) continue;
      const m = new T.Mesh(this.geom(name), this.matFor(mat));
      m.castShadow = mat !== 'glass' && mat !== 'glass_thin' && mat !== 'mesh' && mat !== 'water'; m.receiveShadow = true;
      if (mat === 'glass_thin' || mat === 'glass') m.renderOrder = 2;
      grp.add(m);
    }
    this.scene.add(grp);
    // walk obstacles / platforms from the plan objects
    const solid = { restaurant: 1, wc: 1, gate: 0, kiosk: 1, service: 1, workshop: 1, station: 0, tower: 1, ladya: 0, stage: 1, play_tower: 1, play_rope: 1, play_swing: 1 };
    for (const o of (this.M.objects || [])) {
      if (solid[o.kind]) this.walkObstacles.push({ x: o.x, y: o.y, w: o.w + 0.5, d: o.d + 0.5, rot: o.rot });
      if (o.kind === 'deck' || o.kind === 'terrace' || o.kind === 'pergola') this.walkPlatforms.push({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot, h: (o.top || 0) });
    }
  }
  _furniture() {
    const F = this.man.furniture, grp = this.furnGroup = new T.Group(), m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), s1 = new T.Vector3(1, 1, 1);
    for (const [name, parts] of Object.entries(F.protos)) {
      const inst = F.inst[name] || []; if (!inst.length) continue;
      for (const [mat, mesh] of Object.entries(parts)) {
        const im = new T.InstancedMesh(this.geom(mesh), this.matFor(mat), inst.length);
        inst.forEach((r, i) => { q.setFromAxisAngle(up, -r[3]); m4.compose(new T.Vector3(r[0], r[2], r[1]), q, s1); im.setMatrixAt(i, m4); });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im);
      }
    }
    this.scene.add(grp);
  }

  /* ------------------------------------------------------------------ trees (instanced, two LODs) */
  leafMat(src, sp) {
    const map = this.tex(src, {});
    const m = new T.MeshStandardMaterial({ map, alphaTest: 0.4, alphaToCoverage: this.quality === 'high', side: T.DoubleSide, roughness: 0.78, metalness: 0 });
    m.userData.sp = sp;
    m.onBeforeCompile = (sh) => {    // light leaks through leaves: brighten the shaded side a little
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.10;');
    };
    m.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map, alphaTest: 0.42 });
    return m;
  }
  _trees() {
    const TP = this.man.tree_protos;
    this.treeMeshes = {};   // key sp|var|lod -> [InstancedMesh]
    this.leafMats = [];
    const barkMat = {};
    const bm = (key) => barkMat[key] || (barkMat[key] = new T.MeshStandardMaterial({ map: this.texKey('bark_' + key), roughness: 0.92 }));
    const all = this.man.trees.map(t => ({ x: t[0], y: t[1], z: t[2], r: t[3], s: t[4], sp: t[5], v: t[6], park: 1 }))
      .concat(this.man.shrubs.map(t => ({ x: t[0], y: t[1], z: t[2], r: t[3], s: t[4], sp: t[5], v: t[6], park: 1, shrub: 1 })))
      .concat(this.man.ctx_trees.map(t => ({ x: t[0], y: t[1], z: t[2], r: t[3], s: t[4], sp: t[5], v: t[6] % 2, ctx: 1 })));
    this.treeList = all;
    const count = {};
    for (const t of all) { const k = t.sp + '|' + t.v; count[k] = (count[k] || 0) + 1; }
    const grp = this.treeGroup = new T.Group();
    for (const [sp, P] of Object.entries(TP)) {
      const leafM = P.leaf.map(src => { const m = this.leafMat('tex/' + src, sp); this.leafMats.push(m); return m; });
      P.variants.forEach((V, vi) => {
        const n = count[sp + '|' + vi] || 0; if (!n) return;
        for (const lod of ['lod1', 'lod2']) {
          const parts = V[lod]; if (!parts) continue;
          const arr = [];
          for (const [part, mesh] of Object.entries(parts)) {
            let mat;
            if (part.startsWith('leaf')) mat = leafM[(+part.slice(4)) % leafM.length];
            else mat = bm(part === 'bark_low' ? (P.bark_low || P.bark) : P.bark);
            const im = new T.InstancedMesh(this.geom(mesh), mat, n);
            im.count = 0; im.castShadow = true; im.receiveShadow = !part.startsWith('leaf') || lod === 'lod1';
            im.frustumCulled = false; im.userData.leaf = part.startsWith('leaf'); im.userData.sp = sp;
            grp.add(im); arr.push(im);
          }
          this.treeMeshes[sp + '|' + vi + '|' + lod] = arr;
        }
      });
    }
    this.scene.add(grp);
    this.lodDirty = true;
  }
  // Impostors: every tree variant drawn from three sides into one atlas. One atlas per season (summer, autumn colours,
  // winter = bare deciduous + frosted conifers), drawn on demand, so distant trees follow the season like the near ones.
  _impostors(season) {
    season = season || 0;
    const TP = this.man.tree_protos, keys = [];
    for (const [sp, P] of Object.entries(TP)) P.variants.forEach((V, vi) => { if (V.lod1 && this.treeMeshes[sp + '|' + vi + '|lod1']) keys.push([sp, vi, V]); });
    const S = this.quality === 'low' ? 1024 : 2048, cols = Math.ceil(Math.sqrt(keys.length * 3)), tile = Math.floor(S / cols);
    const rt = new T.WebGLRenderTarget(S, S, { type: T.HalfFloatType, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter });
    (this.impAtlas || (this.impAtlas = {}))[season] = rt;
    const scene = new T.Scene();
    const L = new T.DirectionalLight(0xfff1dc, 3.2); L.position.set(-0.5, 0.75, 0.8); scene.add(L);
    const L2 = new T.DirectionalLight(0xdfe8ff, 0.9); L2.position.set(0.6, 0.4, 0.7); scene.add(L2);
    scene.add(new T.HemisphereLight(0xd8e6ff, 0x6a7448, 1.5));
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    const R = this.renderer, prev = R.getRenderTarget(), cc = new T.Color(); R.getClearColor(cc); const ca = R.getClearAlpha();
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear();
    rt.scissorTest = true;
    // leaves are drawn opaque into the atlas (alpha-to-coverage would leave fractional alpha in a non-MSAA target)
    const a2c = new Set(); for (const k of Object.keys(this.treeMeshes)) for (const im of this.treeMeshes[k]) { const m = im.material; if (m && m.alphaToCoverage) a2c.add(m); }
    for (const m of a2c) { m.alphaToCoverage = false; m.needsUpdate = true; }
    const saved = this.leafMats.map(m => m.color.clone());
    for (const m of this.leafMats) { const sp = m.userData.sp; if (season === 1 && AUTUMN[sp]) m.color.set(AUTUMN[sp]).multiplyScalar(1.15); else if (season === 2) m.color.set(0xb8c4c0); else m.color.set(0xffffff); }
    const box = new T.Box3(), build = !this.impGeo || season === 0 && !this.impMat;
    if (build) this.impGeo = {};
    keys.forEach(([sp, vi, V], k) => {
      const grp = new T.Group(), src = this.treeMeshes[sp + '|' + vi + '|lod1'];
      for (const im of src) grp.add(new T.Mesh(im.geometry, im.material));
      scene.add(grp); box.setFromObject(grp);          // the frame always comes from the full (leafy) tree
      if (season === 2 && DECID[sp]) grp.children.forEach((c, i) => { if (src[i].userData.leaf) c.visible = false; });
      const x0 = box.min.x, x1 = box.max.x, y0 = Math.max(box.min.y, 0), y1 = box.max.y, z0 = box.min.z, z1 = box.max.z;
      const rects = [];
      for (let v = 0; v < 3; v++) {
        const t = k * 3 + v, tx = t % cols, ty = Math.floor(t / cols);
        rt.viewport.set(tx * tile, ty * tile, tile, tile); rt.scissor.set(tx * tile, ty * tile, tile, tile);
        if (v === 0) { cam.position.set(0, 0, 300); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1; }
        else if (v === 1) { cam.position.set(300, 0, 0); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.left = -z1; cam.right = -z0; cam.bottom = y0; cam.top = y1; }
        else { cam.position.set(0, 300, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.left = x0; cam.right = x1; cam.bottom = -z1; cam.top = -z0; }
        cam.near = 1; cam.far = 600; cam.updateProjectionMatrix();
        R.setRenderTarget(rt); R.render(scene, cam);
        rects.push([tx * tile / S, ty * tile / S, (tx + 1) * tile / S, (ty + 1) * tile / S]);
      }
      scene.remove(grp);
      if (!build) return;
      // three quads: front (XY), side (ZY), top (XZ at 0.62 H)
      const P = [], U = [], I = [];
      const quad = (p, uv) => { const b0 = P.length / 3; for (const q of p) P.push(...q); for (const q of uv) U.push(...q); I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); };
      const e = 0.002, r0 = rects[0], r1 = rects[1], r2 = rects[2];
      quad([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], [[r0[0] + e, r0[1] + e], [r0[2] - e, r0[1] + e], [r0[2] - e, r0[3] - e], [r0[0] + e, r0[3] - e]]);
      quad([[0, y0, z1], [0, y0, z0], [0, y1, z0], [0, y1, z1]], [[r1[0] + e, r1[1] + e], [r1[2] - e, r1[1] + e], [r1[2] - e, r1[3] - e], [r1[0] + e, r1[3] - e]]);
      const yt = y0 + (y1 - y0) * 0.62;
      quad([[x0, yt, z1], [x1, yt, z1], [x1, yt, z0], [x0, yt, z0]], [[r2[0] + e, r2[1] + e], [r2[2] - e, r2[1] + e], [r2[2] - e, r2[3] - e], [r2[0] + e, r2[3] - e]]);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
      g.setAttribute('normal', new T.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
      g.setIndex(I); g.computeBoundingSphere();
      this.impGeo[sp + '|' + vi] = g;
    });
    rt.scissorTest = false; rt.viewport.set(0, 0, S, S);
    R.setRenderTarget(prev); R.setClearColor(cc, ca);
    for (const m of a2c) { m.alphaToCoverage = true; m.needsUpdate = true; }
    this.leafMats.forEach((m, i) => m.color.copy(saved[i]));
    if (!build) return;
    const mat = this.impMat = new T.MeshBasicMaterial({ map: rt.texture, alphaTest: 0.5, side: T.DoubleSide });
    mat.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: rt.texture, alphaTest: 0.5 });
    this.impSeason = 0;
    const count = {};
    for (const t of this.treeList) { const k = t.sp + '|' + t.v; count[k] = (count[k] || 0) + 1; }
    for (const [k, g] of Object.entries(this.impGeo)) {
      const im = new T.InstancedMesh(g, mat, count[k] || 1); im.count = 0; im.castShadow = true; im.frustumCulled = false;
      im.userData.leaf = false; im.userData.imp = true; im.userData.sp = k.split('|')[0];
      this.treeGroup.add(im); this.treeMeshes[k + '|imp'] = [im];
    }
  }
  setImpostorSeason(season) {
    if (!this.impMat || this.impSeason === season) return;
    if (!this.impAtlas[season]) this._impostors(season);
    const t = this.impAtlas[season].texture;
    this.impMat.map = t; this.impMat.customDepthMaterial.map = t; this.impMat.needsUpdate = true; this.impMat.customDepthMaterial.needsUpdate = true;
    this.impSeason = season;
  }
  _rebuildImpostors() {
    for (const k of Object.keys(this.treeMeshes)) if (k.endsWith('|imp')) { for (const im of this.treeMeshes[k]) { this.treeGroup.remove(im); im.dispose(); } delete this.treeMeshes[k]; }
    for (const g of Object.values(this.impGeo || {})) g.dispose();
    const col = this.impMat ? this.impMat.color.clone() : null, season = this.impSeason || 0;
    for (const rt of Object.values(this.impAtlas || {})) rt.dispose();
    this.impAtlas = {}; this.impGeo = null; this.impMat = null;
    this._impostors(0); if (col) this.impMat.color.copy(col);
    if (season) this.setImpostorSeason(season);
    this.lodDirty = true; this.updateTrees(true); this.shadowDirty = true; this.dirty = true;
  }
  updateTrees(force) {
    if (!this.treeMeshes) return;
    const cam = this.camera.position;
    if (!force && this._lodPos && this._lodPos.distanceTo(cam) < 3 && this._lodStage === this.sv && this._lodSeason === this.env.season) return;
    this._lodPos = cam.clone(); this._lodStage = this.sv; this._lodSeason = this.env.season;
    const sv = this.sv;
    const grow = sv < 5 ? 0 : sv < 6 ? lerp(0.32, 0.58, sv - 5) : lerp(0.58, 1.0, clamp(sv - 6, 0, 1));
    const shrubGrow = sv < 5.4 ? 0 : sv < 6 ? lerp(0.45, 0.75, (sv - 5.4) / 0.6) : lerp(0.75, 1.0, clamp(sv - 6, 0, 1));
    const buckets = {};
    const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3(), pos = new T.Vector3();
    const near = this.eyeMode ? 90 : 70;
    for (const t of this.treeList) {
      let s = t.s;
      if (t.park) s *= t.shrub ? shrubGrow : grow;
      if (s <= 0.01 || (!this.show.trees && t.park)) continue;
      const dx = t.x - cam.x, dz = t.y - cam.z, d = Math.sqrt(dx * dx + dz * dz);
      if (this.eyeMode && d < (t.shrub ? 1.3 : 2.4) && Math.abs(cam.y - t.z) < 25) continue;   // never put a crown in front of the lens
      let lod = (!t.ctx && d < near) || (t.shrub && d < 120) ? 'lod1' : (d < (this.eyeMode ? 200 : 150) ? 'lod2' : 'imp');
      if (t.shrub && lod !== 'lod1') lod = d < 240 ? 'lod1' : 'imp';
      const key = t.sp + '|' + t.v + '|' + lod;
      (buckets[key] || (buckets[key] = [])).push(t.x, t.z, t.y, t.r, s);
    }
    const winter = this.env.season === 2;
    for (const [key, arr] of Object.entries(this.treeMeshes)) {
      const b = buckets[key] || [], n = b.length / 5;
      for (const im of arr) {
        const hide = winter && im.userData.leaf && DECID[im.userData.sp];
        im.count = hide ? 0 : n;
        if (!n || hide) continue;
        for (let i = 0; i < n; i++) {
          q.setFromAxisAngle(up, -b[i * 5 + 3]); const s = b[i * 5 + 4]; sc.set(s, s, s); pos.set(b[i * 5], b[i * 5 + 1], b[i * 5 + 2]);
          m4.compose(pos, q, sc); im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    }
    this.shadowDirty = true;
  }

  /* ------------------------------------------------------------------ perennials, reeds, lilies */
  _low() {
    const C = this.man.clumps, pal = this.tex(this.man.textures.palette.src, {});
    pal.wrapS = pal.wrapT = T.ClampToEdgeWrapping;
    const mat = this.plantMat = new T.MeshStandardMaterial({ map: pal, side: T.DoubleSide, roughness: 0.85 });
    const by = {};
    for (const r of this.man.low) (by[r[5]] || (by[r[5]] = [])).push(r);
    const grp = this.lowGroup = new T.Group(), m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
    for (const [k, list] of Object.entries(by)) {
      if (!C[k]) continue;
      const im = new T.InstancedMesh(this.geom(C[k]), mat, list.length);
      list.forEach((r, i) => { q.setFromAxisAngle(up, r[3]); m4.compose(new T.Vector3(r[0], r[1], r[2]), q, new T.Vector3(r[4], r[4], r[4])); im.setMatrixAt(i, m4); });
      im.computeBoundingSphere(); im.receiveShadow = true; grp.add(im);
    }
    this.scene.add(grp);
  }

  /* ------------------------------------------------------------------ city around */
  _context() {
    const grp = this.ctxGroup = new T.Group();
    for (const [mat, name] of Object.entries(this.man.ctx)) {
      if (!name) continue;
      const g = this.geom(name);
      const flat = mat === 'g_asphalt' || mat === 'g_pav_main' || mat === 'paint_white';
      if (flat) this.worldUV(g);
      const m = new T.Mesh(g, this.matFor(mat)); m.receiveShadow = true; m.castShadow = mat.startsWith('city');
      if (flat) { m.position.y = mat === 'paint_white' ? 0.04 : 0.02; m.renderOrder = 1; m.material = m.material.clone(); m.material.side = T.DoubleSide; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -2; }
      grp.add(m);
    }
    this.scene.add(grp);
  }
  _fence() {    // construction fence along the site boundary (stages 1-5)
    const S = this.M.site, pts = [];
    for (let i = 0; i < S.length; i++) { const a = S[i], b = S[(i + 1) % S.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 3); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, a, b]); }
    const geos = [];
    for (const [x, y, a, b] of pts) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const g = new T.BoxGeometry(3.0, 2.0, 0.05); g.rotateY(-ang); g.translate(x + Math.cos(ang) * 1.5, this.gY(x, y) + 1.0, y + Math.sin(ang) * 1.5);
      geos.push(g);
    }
    const g = T.BufferGeometryUtils.mergeGeometries(geos);
    this.fenceMesh = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x5a7a6a, roughness: 0.6, metalness: 0.3 }));
    this.fenceMesh.castShadow = true; this.scene.add(this.fenceMesh);
  }
  _scrub() {    // today: willow / birch scrub on the swamp
    const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const S = this.M.site, inPoly = (x, y) => { let c = false; for (let i = 0, j = S.length - 1; i < S.length; j = i++) { const a = S[i], b = S[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const list = [];
    for (let k = 0; k < 2600 && list.length < 260; k++) {
      const x = rnd() * 520, y = rnd() * 330; if (!inPoly(x, y)) continue;
      if (rnd() < 0.5 && y > 150) continue;
      list.push([x, y, rnd() < 0.6 ? 'birch' : 'willow', 0.25 + 0.35 * rnd(), rnd() * 6.28]);
    }
    this.scrubGroup = new T.Group();
    const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
    for (const sp of ['birch', 'willow']) {
      const L = list.filter(r => r[2] === sp), V = this.man.tree_protos[sp].variants[0].lod2;
      for (const [part, mesh] of Object.entries(V)) {
        const leaf = part.startsWith('leaf');
        const mat = leaf ? this.leafMats.find(m => m.userData.sp === sp) : new T.MeshStandardMaterial({ map: this.texKey('bark_' + this.man.tree_protos[sp].bark), roughness: 0.9 });
        const im = new T.InstancedMesh(this.geom(mesh), mat, L.length);
        L.forEach((r, i) => { q.setFromAxisAngle(up, r[4]); m4.compose(new T.Vector3(r[0], this.H0 ? this.gY0(r[0], r[1]) : 0.3, r[1]), q, new T.Vector3(r[3], r[3] * 0.8, r[3])); im.setMatrixAt(i, m4); });
        im.castShadow = true; im.computeBoundingSphere(); this.scrubGroup.add(im);
      }
    }
    this.scene.add(this.scrubGroup);
  }
  gY0(x, z) { const U = this.terrU, m = U.uMorph.value, f = U.uFill.value; U.uMorph.value = 0; U.uFill.value = 0; const h = this.gY(x, z); U.uMorph.value = m; U.uFill.value = f; return h; }

  /* ------------------------------------------------------------------ labels */
  _pois() {
    const P = this.pois = (this.M.pois || []).map(p => Object.assign({}, p));
    const host = this.labelHost = document.createElement('div'); host.className = 'p3-labels'; this.el.appendChild(host);
    for (const p of P) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'p3-pin ' + (p.kind === 'view' ? 'view' : '');
      b.innerHTML = p.kind === 'view' ? '<i>' + p.view + '</i>' : '<i></i><span>' + p.title + '</span>'; b.title = p.title;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (this.opts.onPOI) this.opts.onPOI(p); });
      host.appendChild(b); p.el = b; p.v = new T.Vector3(p.x, (p.y != null ? p.y : this.gY(p.x, p.z) + 6), p.z);
    }
    this.zoneHost = document.createElement('div'); this.zoneHost.className = 'p3-zonelabels'; this.zoneHost.style.display = 'none'; this.el.appendChild(this.zoneHost);
    this.zoneEls = (this.M.zone_labels || []).map(z => { const e = document.createElement('div'); e.className = 'p3-zl'; e.textContent = z.name; e.style.color = z.color || '#2a4a3a'; this.zoneHost.appendChild(e); return { e, v: new T.Vector3(z.x, 6, z.y) }; });
  }
  updateLabels() {
    if (!this.pois) return;
    const W = this.el.clientWidth, H = this.el.clientHeight, cam = this.camera, v = new T.Vector3();
    const placed = [[0, 0, 220, 62], [W - 64, 0, W, 64]];
    const hit = (r) => placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    const order = this._order || (this._order = this.pois.slice().sort((a, b) => (a.kind === 'view' ? 0 : 1) - (b.kind === 'view' ? 0 : 1) || (a.pr || 9) - (b.pr || 9)));
    for (const p of order) {
      const vis = this.show.labels && this.sv >= (p.from || 0) - 0.01;
      if (!vis) { p.el.hidden = true; continue; }
      v.copy(p.v).project(cam);
      if (v.z > 1 || v.z < -1) { p.el.hidden = true; continue; }
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      if (sx < 4 || sy < 20 || sx > W - 4 || sy > H) { p.el.hidden = true; continue; }
      let mini = false;
      if (p.kind === 'view') placed.push([sx - 12, sy - 26, sx + 12, sy]);
      else { if (!p.w || p.w < 20) { p.el.hidden = false; p.w = p.el.offsetWidth || (p.title.length * 7.2 + 28); } const lw = p.w + 6, r = [sx - lw / 2, sy - 26, sx + lw / 2, sy]; if (!hit(r)) placed.push(r); else { const r2 = [sx - 8, sy - 16, sx + 8, sy]; if (hit(r2)) { p.el.hidden = true; continue; } placed.push(r2); mini = true; } }
      p.el.hidden = false; p.el.classList.toggle('mini', mini); p.el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-100%)';
    }
    if (this.show.zones) for (const z of this.zoneEls) { v.copy(z.v).project(cam); const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H; z.e.style.transform = 'translate(' + sx.toFixed(0) + 'px,' + sy.toFixed(0) + 'px) translate(-50%,-50%)'; z.e.hidden = v.z > 1; }
  }

  /* ------------------------------------------------------------------ post-processing */
  _post() {
    // GTAO + grade are opt-in (opts.post): on many GPUs the AO pass darkened whole facades and left pale halos round foliage
    if (this.quality !== 'high' || !T.EffectComposer || !this.opts.post) return;
    try {
      const w = this.el.clientWidth || 800, h = this.el.clientHeight || 500;
      const rt = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: 4 });
      const c = this.composer = new T.EffectComposer(this.renderer, rt);
      c.addPass(new T.RenderPass(this.scene, this.camera));
      if (T.GTAOPass) {
        const ao = this.ao = new T.GTAOPass(this.scene, this.camera, w, h);
        ao.output = T.GTAOPass.OUTPUT.Default;
        ao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 2, thickness: 3, scale: 1.0, samples: 12 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        ao.blendIntensity = 0.75;
        c.addPass(ao);
      }
      c.addPass(new T.OutputPass());
      if (T.ShaderPass) {     // light photographic grade in display space: gentle S-curve, a touch of saturation, vignette
        const grade = this.grade = new T.ShaderPass({
          uniforms: { tDiffuse: { value: null }, uSat: { value: 1.08 }, uCon: { value: 0.10 }, uVig: { value: 0.22 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig; varying vec2 vUv;
void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 x = c.rgb;
  float l = dot(x, vec3(0.2126, 0.7152, 0.0722)); x = mix(vec3(l), x, uSat);
  x = mix(x, x * x * (3.0 - 2.0 * x), uCon);
  vec2 d = vUv - 0.5; x *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
  gl_FragColor = vec4(clamp(x, 0.0, 1.0), c.a); }` });
        c.addPass(grade);
      }
      this.resize();
    } catch (e) { console.warn('post-processing disabled', e); this.composer = null; }
  }


  /* ------------------------------------------------------------------ evening: dusk sky and pools of lamp light */
  _duskSky() {
    if (this.duskTex) return;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0.0, '#0e1a33'); gr.addColorStop(0.30, '#283f6a'); gr.addColorStop(0.43, '#6d6f8e'); gr.addColorStop(0.485, '#e09a62');
    gr.addColorStop(0.5, '#f3b777'); gr.addColorStop(0.52, '#5b5048'); gr.addColorStop(1.0, '#1e1c1a');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    // a warm glow toward the sunset
    const sx = ((Math.atan2(this.sunDir.z, this.sunDir.x) / (2 * Math.PI)) + 0.5) * 1024;
    for (const off of [-1024, 0, 1024]) {
      const rg = g.createRadialGradient(sx + off, 250, 4, sx + off, 250, 300); rg.addColorStop(0, 'rgba(255,190,120,0.75)'); rg.addColorStop(1, 'rgba(255,150,90,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 1024, 512);
    }
    const t = this.duskTex = new T.CanvasTexture(c); t.mapping = T.EquirectangularReflectionMapping; t.colorSpace = T.SRGBColorSpace;
    const pm = new T.PMREMGenerator(this.renderer); this.duskEnv = pm.fromEquirectangular(t).texture; pm.dispose();
  }
  _pools() {
    const F = this.man.furniture, pts = (F.inst.F_pole || []).concat(F.inst.F_lamp || []);
    if (!pts.length) return;
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 64); rg.addColorStop(0, 'rgba(255,200,130,1)'); rg.addColorStop(0.35, 'rgba(255,170,90,0.45)'); rg.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const geo = new T.PlaneGeometry(13, 13); geo.rotateX(-Math.PI / 2);
    const im = this.pools = new T.InstancedMesh(geo, mat, pts.length), m4 = new T.Matrix4();
    pts.forEach((r, i) => { m4.makeTranslation(r[0], r[2] + 0.08, r[1]); im.setMatrixAt(i, m4); });
    im.visible = false; im.frustumCulled = false; im.renderOrder = 3; this.scene.add(im);
  }

  /* ------------------------------------------------------------------ environment: season, time of day */
  setEnv(o) { Object.assign(this.env, o); this.applyEnv(); }
  applyEnv() {
    if (!this.sun) return;
    const { season, tod } = this.env, eve = tod === 1;
    const U = this.terrU;
    U.uAutumn.value = season === 1 ? 1 : 0; U.uSnow.value = season === 2 ? 1 : 0;
    // sun and sky
    const d = this.sunDir.clone();
    if (eve) { d.y = 0.10; d.normalize(); }
    this._sunVec = d;
    this.sun.color.set(eve ? 0xffb070 : season === 2 ? 0xfff4ea : 0xfff1dc);
    this.sun.intensity = eve ? 1.6 : season === 2 ? 2.4 : 3.1;
    this.hemi.intensity = eve ? 0.18 : 0.35;
    this._duskSky();
    this.scene.background = eve ? this.duskTex : this.skyTex;
    this.scene.environment = eve ? this.duskEnv : this.envMap;
    this.scene.backgroundIntensity = 1.0;
    this.scene.environmentIntensity = eve ? 0.35 : (season === 2 ? 0.7 : 0.55);
    if (this.pools) this.pools.visible = eve;
    if (this.farMat) this.farMat.color.set(season === 2 ? 0xdfe6ec : season === 1 ? 0x8a8248 : 0x6b7d4a);
    this.scene.fog.color.set(eve ? 0x8a7a78 : season === 2 ? 0xd8e0e8 : 0xc4d2de);
    this.renderer.toneMappingExposure = eve ? 1.25 : 1.0;

    // foliage tints
    if (this.impMat) { this.impMat.color.setScalar(eve ? 0.45 : season === 2 ? 0.9 : 1.0); this.setImpostorSeason(season); }
    for (const m of this.leafMats) {
      const sp = m.userData.sp;
      if (season === 1 && AUTUMN[sp]) m.color.set(AUTUMN[sp]).multiplyScalar(1.15); else if (season === 2) m.color.set(0xb8c4c0); else m.color.set(0xffffff);
    }
    if (this.plantMat) this.plantMat.color.set(season === 1 ? 0xd8b070 : season === 2 ? 0xf0f4f6 : 0xffffff);
    for (const w of this.waters) {
      if (season === 2) { if (!w.userData.orig) w.userData.orig = w.material; w.material = this.iceMat; }
      else if (w.userData.orig) { w.material = w.userData.orig; w.userData.orig = null; }
      if (w.material.uniforms && w.material.uniforms.sunDirection) w.material.uniforms.sunDirection.value.copy(d);
    }
    // roofs under snow
    const roof = this._mats && this._mats.roof_green; if (roof) roof.color.set(season === 2 ? 0xe8eef2 : 0x1f3d2f);
    for (const k of ['lemekh', 'sedum']) { const r = this._mats && this._mats[k]; if (r) { r.color.set(season === 2 ? 0xf4f7fa : 0xffffff); r.map = season === 2 ? null : (r.userData.map || (r.userData.map = r.map)); r.needsUpdate = true; } }
    if (this.warmMat) this.warmMat.emissiveIntensity = eve ? 3.2 : 0.35;
    this.lodDirty = true; this.shadowDirty = true; this.dirty = true; this._lodStage = -1;
  }

  /* ------------------------------------------------------------------ construction stages */
  derived(sv) {
    return {
      morph: smooth(1.2, 2.0, sv),          // pits of the ponds
      fill: smooth(2.6, 4.0, sv),           // berm, tower hill and the raise of the land
      swamp: 1 - smooth(0.6, 1.4, sv),
      bare: smooth(0.6, 1.4, sv) * (1 - smooth(4.9, 6.0, sv)),
      water: sv < 2.3 ? 0 : smooth(2.3, 3.0, sv),
      paths: sv >= 4.45, arch: sv >= 4.45, furn: sv >= 5.4, low: sv >= 5.6, scrub: sv < 1.1, fence: sv >= 0.8 && sv < 5.8,
      ctxTrees: true
    };
  }
  applyState(force) {
    if (!this.terrU) return;
    const sv = this.sv, d = this.derived(sv);
    this.terrU.uMorph.value = d.morph; this.terrU.uFill.value = d.fill; this.terrU.uSwamp.value = d.swamp; this.terrU.uBare.value = d.bare;
    for (const w of this.waters) { w.visible = this.show.water && d.water > 0.01; w.position.y = w.userData.level - (1 - d.water) * 1.6; }
    this.groundGroup.visible = d.paths && this.show.paths !== false;
    this.structures.visible = d.arch; this.furnGroup.visible = d.furn; this.lowGroup.visible = d.low;
    this.scrubGroup.visible = d.scrub; this.fenceMesh.visible = d.fence;
    if (this.puddles) this.puddles.visible = sv < 1.5;
    this.updateTrees(true);
    this.shadowDirty = true; this.dirty = true;
  }
  setStage(s, animate) {
    s = clamp(s, 0, STAGES - 1);
    if (!animate) { this.sv = s; this.tw = null; this.applyState(true); return; }
    this.tw = { a: this.sv, b: s, t0: performance.now(), dur: 1400 + 300 * Math.abs(s - this.sv) };
  }
  setStageFloat(v) { this.sv = clamp(v, 0, STAGES - 1); this.tw = null; this.applyState(false); }
  setShow(o) { Object.assign(this.show, o); this.applyState(true); if (this.labelHost) this.labelHost.style.display = this.show.labels ? '' : 'none'; if (this.zoneHost) this.zoneHost.style.display = this.show.zones ? '' : 'none'; this.dirty = true; }

  /* ------------------------------------------------------------------ camera */
  setCameraPreset(name, animate) {
    this.eyeMode = false; const C = this.controls;
    const P = {
      iso: [[118, 255, 420], [268, 0, 168], 40], plan: [[268, 640, 176], [268, 0, 168], 38], low: [[337.4, 2.6, 316.5], [354.4, 4.2, 291.4], 58],
      south: [[250, 140, 470], [262, 0, 170], 40], east: [[700, 190, 250], [268, 0, 168], 40]
    }[name] || null;
    if (!P) return;
    if (name === 'low') { this.eyeMode = true; C.minDistance = 0.5; }
    else C.minDistance = 4;
    this.camera.fov = P[2]; this.camera.updateProjectionMatrix();
    this.flyTo(P[0], P[1], animate ? 1500 : 0);
  }
  viewFromTower() {
    const t = (this.M.objects || []).find(o => o.kind === 'tower'); if (!t) return;
    const gy = this.gY(t.x, t.y); this.eyeMode = true; this.camera.fov = 60; this.camera.updateProjectionMatrix(); this.controls.minDistance = 0.3;
    this.flyTo([t.x - 2.2, gy + 25.4, t.y + 2.2], [t.x - 60, gy + 12, t.y + 70], 1800);
  }
  focusPOI(p) { const y = this.gY(p.x, p.z); this.eyeMode = false; this.camera.fov = 40; this.camera.updateProjectionMatrix(); this.controls.minDistance = 3; this.flyTo([p.x + 55, y + 48, p.z + 70], [p.x, y + 2, p.z], 1300); }
  flyTo(pos, tgt, ms) {
    const c = this.camera, C = this.controls;
    if (!ms) { c.position.set(pos[0], pos[1], pos[2]); C.target.set(tgt[0], tgt[1], tgt[2]); C.update(); this.dirty = this.shadowDirty = this.lodDirty = true; return; }
    this.fly = { p0: c.position.clone(), t0: C.target.clone(), p1: new T.Vector3(...pos), t1: new T.Vector3(...tgt), s: performance.now(), d: ms };
  }

  /* ------------------------------------------------------------------ frame loop */
  resize() {
    const w = this.el.clientWidth || 800, h = this.el.clientHeight || 500;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(w, h); this.composer.setPixelRatio && this.composer.setPixelRatio(this.renderer.getPixelRatio()); }
    this.dirty = true;
  }
  fitShadow() {
    const L = this.sun, C = this.controls.target, cam = this.camera.position;
    const dist = cam.distanceTo(C);
    const half = this.eyeMode ? 90 : clamp(dist * 0.62, 60, 380);
    const ctr = this.eyeMode ? new T.Vector3(cam.x, this.gY(cam.x, cam.z), cam.z).add(new T.Vector3().subVectors(C, cam).setY(0).normalize().multiplyScalar(45)) : C.clone();
    const d = this._sunVec || this.sunDir;
    L.target.position.copy(ctr); L.position.copy(ctr).addScaledVector(d, 800);
    const sc = L.shadow.camera; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 200; sc.far = 1400; sc.updateProjectionMatrix();
    L.target.updateMatrixWorld(); L.updateMatrixWorld();
    this.renderer.shadowMap.needsUpdate = true;
  }
  renderNow() {
    if (this.lodDirty) { this.updateTrees(false); this.lodDirty = false; }
    this.fitShadow();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.updateLabels(); this.dirty = false;
    if (this.opts.onFrame) this.opts.onFrame(this.camera, this.controls);
  }
  loop() {
    requestAnimationFrame(this._loop);
    if (this.paused) return;
    const now = performance.now();
    if (this.fly) {
      const f = this.fly, t = clamp((now - f.s) / f.d, 0, 1), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, e); this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (t >= 1) this.fly = null; this.dirty = this.lodDirty = true;
    }
    if (this.tw) {
      const w = this.tw, t = clamp((now - w.t0) / w.dur, 0, 1), e = t * t * (3 - 2 * t);
      this.sv = lerp(w.a, w.b, e); this.applyState(false); if (t >= 1) { this.sv = w.b; this.tw = null; this.applyState(true); }
    }
    this.controls.update();
    const animWater = this.waters && this.waters.length && this.waters[0].material.uniforms && this.show.water && !this.opts.still && this.env.season !== 2;
    if (animWater) { const dt = Math.min(0.1, (now - this._tPrev) / 1000); for (const w of this.waters) if (w.material.uniforms) w.material.uniforms.time.value += dt * 0.6; this.dirty = true; }
    this._tPrev = now;
    if (this.dirty) this.renderNow();
  }
}
global.Park3D = Park3D;
global.P3A = { loadAssets, decodeGeom, AUTUMN, DECID };
})(window);
