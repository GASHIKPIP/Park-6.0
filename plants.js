/* Каталог растений проекта: данные и 3D-просмотр одного растения (WebGL), с запасным изображением. */
(function (global) {
'use strict';
const PLANTS = [
  // ---- деревья
  { id: 'b', g: 'Деревья', name: 'Берёза повислая и пушистая', lat: 'Betula pendula, B. pubescens', h: '9–10 м', zone: '1–2', role: 'Основа посадок: у воды, вдоль троп, на полянах.', why: 'Местный вид, выдерживает морозы ниже −45 °C и переувлажнение.', season: 'Золотая осень, белые стволы зимой.', model: 'tree', code: 'b' },
  { id: 'a', g: 'Деревья', name: 'Ольха серая', lat: 'Alnus incana', h: '8–9 м', zone: '1', role: 'Береговые группы у обоих прудов.', why: 'Растёт на сырых торфяных почвах, корнями закрепляет откосы, обогащает почву азотом.', season: 'Ранние серёжки в апреле, листва держится до заморозков.', model: 'tree', code: 'a' },
  { id: 'w', g: 'Деревья', name: 'Ива козья и пятитычинковая', lat: 'Salix caprea, S. pentandra', h: '7–8 м', zone: '1–2', role: 'Мокрые низины и берег у каскада.', why: 'Выносливые северные ивы, первый весенний медонос для пчёл и шмелей.', season: 'Пушистые серёжки в конце апреля, блестящая листва летом.', model: 'tree', code: 'w' },
  { id: 'j', g: 'Деревья', name: 'Яблоня ягодная', lat: 'Malus baccata', h: '5–6 м', zone: '2', role: 'Входная аллея и площадь у главного входа.', why: 'Самая зимостойкая яблоня, заменяет липу. Мелкие плоды держатся зимой и кормят птиц.', season: 'Белое цветение в июне, красные плоды до снега.', model: 'tree', code: 'j' },
  { id: 'h', g: 'Деревья', name: 'Черёмуха обыкновенная', lat: 'Prunus padus', h: '6–7 м', zone: '1', role: 'Опушки, тихая зона, вдоль южной тропы.', why: 'Местный вид, заменяет клён. Растёт в тени и на влажных почвах.', season: 'Душистое цветение в начале июня, тёмные ягоды для птиц.', model: 'tree', code: 'h' },
  { id: 'k', g: 'Деревья', name: 'Сосна кедровая сибирская', lat: 'Pinus sibirica', h: '5–6 м за 10 лет', zone: '1', role: 'Культурная зона, холм с башней, у «Поморской ладьи».', why: 'Заменяет дуб: вечнозелёная, долговечная, переносит северные зимы. Растёт медленно, орехи через 25–30 лет.', season: 'Тёмная хвоя круглый год.', model: 'tree', code: 'k' },
  { id: 's', g: 'Деревья', name: 'Ель европейская и сибирская', lat: 'Picea abies, P. obovata', h: '7–8 м', zone: '1', role: 'Берма вдоль проспекта, ветрозащита северной стороны.', why: 'Гасит шум и ветер, задерживает снег, зелёная зимой.', season: 'Зелёная стена и снежные лапы зимой.', model: 'tree', code: 's' },
  { id: 'p', g: 'Деревья', name: 'Сосна обыкновенная', lat: 'Pinus sylvestris', h: '9–10 м', zone: '1', role: 'Сухие повышения, холм, берма.', why: 'Местный вид, растёт на бедных и песчаных почвах насыпей.', season: 'Медные стволы, хвоя круглый год.', model: 'tree', code: 'p' },
  { id: 'l', g: 'Деревья', name: 'Лиственница сибирская', lat: 'Larix sibirica', h: '10–11 м', zone: '1', role: 'Акценты у башни и вдоль культурной аллеи.', why: 'Одно из самых морозостойких деревьев, древесина для настилов того же вида.', season: 'Ярко-жёлтая осень, зимой сбрасывает хвою.', model: 'tree', code: 'l' },
  { id: 'r', g: 'Деревья', name: 'Рябина обыкновенная', lat: 'Sorbus aucuparia', h: '5–6 м', zone: '1', role: 'Детская зона, опушки, у галерей.', why: 'Местный вид, ягоды держатся до зимы и привлекают свиристелей и дроздов.', season: 'Белое цветение, красные ягоды и багряная листва осенью.', model: 'tree', code: 'r' },
  // ---- стланики и кустарники
  { id: 'n', g: 'Стланики и кустарники', name: 'Берёза карликовая (ерник)', lat: 'Betula nana', h: '0,5–0,8 м, стелется до 2 м', zone: '1', role: 'Группы на берме, склонах холма и у станции «Следы леса».', why: 'Тундровая берёза растёт горизонтально, низкие плети прячутся под снег и не ломаются.', season: 'Мелкие круглые листья летом, ярко-красная осень.', model: 'dwarf' },
  { id: 'c', g: 'Стланики и кустарники', name: 'Стланиковая берёза пушистая', lat: 'Betula pubescens subsp. czerepanovii', h: 'ствол стелется 3–6 м, высота 1–1,5 м', zone: '1', role: 'Одиночные скульптурные деревья у воды, фигур и станции.', why: 'Северная горная форма берёзы с лежачими изогнутыми стволами. Формируется при посадке.', season: 'Белые извилистые стволы особенно видны зимой.', model: 'creep' },
  { id: 'cornus', g: 'Стланики и кустарники', name: 'Дёрен белый', lat: 'Cornus alba', h: '2–2,5 м', zone: '1', role: 'Живая изгородь 420 м и куртины у дорожек.', why: 'Выдерживает −40 °C, переносит подтопление.', season: 'Красные побеги зимой на снегу.', model: 'shrub', col: [0.24, 0.42, 0.18], aut: [0.62, 0.20, 0.18], stems: [0.62, 0.12, 0.10] },
  { id: 'spiraea', g: 'Стланики и кустарники', name: 'Спирея иволистная', lat: 'Spiraea salicifolia', h: '1,2–1,5 м', zone: '1', role: 'Куртины вдоль аллей и у площадок.', why: 'Местный вид, нетребовательна к почвам.', season: 'Розовые метёлки в июле.', model: 'shrub', col: [0.30, 0.46, 0.18], aut: [0.72, 0.52, 0.18], flowers: [0.92, 0.55, 0.72] },
  { id: 'rosa', g: 'Стланики и кустарники', name: 'Шиповник иглистый', lat: 'Rosa acicularis', h: '1–1,5 м', zone: '1', role: 'Солнечные опушки и колючий барьер у служебной зоны.', why: 'Самый северный шиповник, местный вид.', season: 'Розовые цветы в июне, красные плоды осенью.', model: 'shrub', col: [0.27, 0.44, 0.17], aut: [0.75, 0.30, 0.14], flowers: [0.95, 0.50, 0.62] },
  { id: 'juniper', g: 'Стланики и кустарники', name: 'Можжевельник обыкновенный', lat: 'Juniperus communis', h: '1,5–3 м', zone: '1', role: 'Склоны холма, у фигур «Северных историй».', why: 'Вечнозелёный, переносит ветер и бедные почвы.', season: 'Сизая хвоя круглый год, тёмные шишкоягоды.', model: 'juniper' },
  // ---- прибрежные и водные
  { id: 'phr', g: 'Прибрежные и водные', name: 'Тростник обыкновенный', lat: 'Phragmites australis', h: '2–2,5 м', zone: '1', role: 'Литораль: пояс на шельфе 0,45 м.', why: 'Очищает воду, укрепляет берег, укрытие для птиц. Не скашивается на зиму.', season: 'Золотистые метёлки осенью и зимой.', model: 'reed' },
  { id: 'typha', g: 'Прибрежные и водные', name: 'Рогоз широколистный', lat: 'Typha latifolia', h: '1,5–2 м', zone: '1', role: 'Группы на мелководье у настилов.', why: 'Быстро разрастается на мелководье и забирает из воды биогенные вещества.', season: 'Бархатные коричневые початки с июля до весны.', model: 'typha' },
  { id: 'caltha', g: 'Прибрежные и водные', name: 'Калужница болотная', lat: 'Caltha palustris', h: '0,3–0,4 м', zone: '1', role: 'Урез воды у каскада и прибрежная полоса.', why: 'Местный вид болот, цветёт одним из первых.', season: 'Жёлтые цветы в мае–июне.', model: 'caltha' },
  { id: 'iris', g: 'Прибрежные и водные', name: 'Ирис аировидный', lat: 'Iris pseudacorus', h: '0,8–1 м', zone: '3', role: 'Защищённые заливы у павильона и входной площади.', why: 'Самый крайний для Архангельска вид в списке, сажается только в тёплых местах у воды.', season: 'Крупные жёлтые цветы в конце июня.', model: 'iris' },
  { id: 'nymph', g: 'Прибрежные и водные', name: 'Кувшинка четырёхгранная и кубышка жёлтая', lat: 'Nymphaea tetragona, Nuphar lutea', h: 'листья на воде', zone: '1', role: 'Глубокая вода 0,8–1,5 м, около 400 растений.', why: 'Северная кувшинка и местная кубышка зимуют подо льдом в донном иле.', season: 'Цветение в июле–августе.', model: 'lily' },
  { id: 'meadow', g: 'Прибрежные и водные', name: 'Северный луг', lat: 'Chamaenerion, Achillea, Trifolium, Geranium, Campanula', h: '0,4–1,2 м', zone: '1', role: 'Луга 3,8 га вместо газона на большей части суши.', why: 'Местное разнотравье, косится 1–2 раза в лето, кормит опылителей.', season: 'Иван-чай в июле, герань и колокольчики в июне.', model: 'meadow' },
];

class PlantViewer {
  /* One plant at a time, built from the same prototypes as the 3D model and the renders (park_geo.json + park.bin). */
  constructor(el, opts) {
    this.el = el; this.season = 0; this.ok = false; this.base = (opts && opts.base) || '';
    try {
      const T = global.THREE; if (!T || !global.P3A) throw new Error('no three');
      const R = this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      R.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2)); R.outputColorSpace = T.SRGBColorSpace; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
      R.shadowMap.enabled = true; R.shadowMap.type = T.PCFShadowMap;
      R.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab'; el.appendChild(R.domElement);
      this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(32, 1, 0.1, 400);
      this.controls = new T.OrbitControls(this.camera, R.domElement); this.controls.enableDamping = true; this.controls.autoRotate = true; this.controls.autoRotateSpeed = 1.0; this.controls.enablePan = false; this.controls.maxPolarAngle = 1.5;
      this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });
      const sun = this.sun = new T.DirectionalLight(0xfff1dc, 2.8); sun.position.set(12, 18, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; this.scene.add(sun); this.scene.add(sun.target);
      this.hemi = new T.HemisphereLight(0xc9dcf5, 0x5d6b4a, 1.0); this.scene.add(this.hemi);
      this.ground = new T.Mesh(new T.CircleGeometry(14, 64), new T.MeshStandardMaterial({ color: 0x6f8a4c, roughness: 1 })); this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
      this.water = new T.Mesh(new T.CircleGeometry(5, 64), new T.MeshStandardMaterial({ color: 0x23453f, roughness: 0.08, metalness: 0.2 })); this.water.rotation.x = -Math.PI / 2; this.water.position.y = 0.02; this.water.visible = false; this.scene.add(this.water);
      this.group = new T.Group(); this.scene.add(this.group);
      this.texCache = {}; this.loader = new T.TextureLoader();
      new ResizeObserver(() => this.resize()).observe(el); this.resize();
      const loop = () => { requestAnimationFrame(loop); if (!this.visible) return; this.controls.update(); R.render(this.scene, this.camera); };
      this.visible = true; requestAnimationFrame(loop);
      this.ok = true;
    } catch (e) { console.warn(e); this.ok = false; }
  }
  resize() { if (!this.renderer) return; const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  setSeason(s) { this.season = s; if (this.cur) this.show(this.cur); }
  tex(src, srgb) { const T = global.THREE; if (this.texCache[src]) return this.texCache[src]; const t = this.loader.load(this.base + src); t.colorSpace = srgb === false ? T.NoColorSpace : T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; this.texCache[src] = t; return t; }
  async show(p) {
    if (!this.ok) return; this.cur = p; const T = global.THREE, g = this.group, s = this.season, win = s === 2, aut = s === 1, tok = (this._tok = (this._tok || 0) + 1);
    const A = await global.P3A.loadAssets(this.base); if (tok !== this._tok) return;
    const man = A.man, geom = (name) => global.P3A.decodeGeom(man, A.bin, name);
    while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.scene.background = new T.Color(win ? 0xdfe6ee : aut ? 0xe0d8c4 : 0xd3e3ef);
    this.ground.material.color.set(win ? 0xf1f4f7 : aut ? 0x8f8450 : 0x6f8a4c); this.water.visible = false;
    const TREE = { b: 'birch', a: 'alder', w: 'willow', j: 'apple', h: 'cherry', k: 'cedar', s: 'spruce', p: 'pine', l: 'larch', r: 'rowan' };
    const SHR = { n: 'S_bn', c: 'S_bc', cornus: 'S_cor', spiraea: 'S_spi', rosa: 'S_ros', juniper: 'S_jun' };
    const CL = { phr: 'reed', typha: 'typha', iris: 'iris', caltha: 'sedge', nymph: 'lily', meadow: 'meadow' };
    let H = 2, R = 1;
    const sp = TREE[p.id] || SHR[p.id];
    if (sp && man.tree_protos[sp]) {
      const P = man.tree_protos[sp], V = P.variants[0], parts = V.lod1, decid = global.P3A.DECID[sp];
      H = V.H; R = V.R || H * 0.35;
      const bark = new T.MeshStandardMaterial({ map: this.tex(man.textures['bark_' + P.bark].src), roughness: 0.92 });
      const leafs = P.leaf.map(src => { const m = new T.MeshStandardMaterial({ map: this.tex('tex/' + src), alphaTest: 0.4, side: T.DoubleSide, roughness: 0.8 });
        if (aut && global.P3A.AUTUMN[sp]) m.color.set(global.P3A.AUTUMN[sp]).multiplyScalar(1.15); else if (win) m.color.set(0xb8c4c0);
        m.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: m.map, alphaTest: 0.4 }); return m; });
      for (const [part, mesh] of Object.entries(parts)) {
        const leaf = part.startsWith('leaf'); if (leaf && win && decid) continue;
        const me = new T.Mesh(geom(mesh), leaf ? leafs[(+part.slice(4)) % leafs.length] : bark); me.castShadow = true; me.receiveShadow = true; g.add(me);
      }
    } else if (CL[p.id] && man.clumps[CL[p.id]]) {
      const k = CL[p.id], pal = this.tex(man.textures.palette.src); pal.wrapS = pal.wrapT = T.ClampToEdgeWrapping;
      const mat = new T.MeshStandardMaterial({ map: pal, side: T.DoubleSide, roughness: 0.85 });
      if (aut) mat.color.set(0xd8b070); if (win) mat.color.set(0xe8ecee);
      const aquatic = k !== 'meadow'; this.water.visible = aquatic; this.water.material.color.set(win ? 0xdfe8ef : 0x23453f);
      const n = k === 'meadow' ? 140 : k === 'lily' ? 16 : 22, rad = k === 'meadow' ? 5 : 2.6, geo = geom(man.clumps[k]);
      const kinds = k === 'meadow' ? ['meadow', 'meadow', 'achillea', 'rudbeckia', 'salvia', 'desch'] : [k];
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < n; i++) { const kk = kinds[i % kinds.length], gg = kk === k ? geo : geom(man.clumps[kk]); if (!gg) continue; const me = new T.Mesh(gg, mat), a = rnd() * 6.283, r = Math.sqrt(rnd()) * rad; me.position.set(Math.cos(a) * r, k === 'lily' ? 0.04 : 0, Math.sin(a) * r); me.rotation.y = rnd() * 6.28; me.scale.setScalar(0.8 + 0.5 * rnd()); me.castShadow = true; me.receiveShadow = true; g.add(me); }
      g.updateMatrixWorld(true); const box = new T.Box3().setFromObject(g); H = Math.max(0.6, box.max.y); R = rad;
    }
    const d = Math.max(4.5, H * 1.7 + 2, R * 3.2);
    const sc = this.sun.shadow.camera, e = Math.max(4, R * 1.6, H * 0.8); sc.left = sc.bottom = -e; sc.right = sc.top = e; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix();
    this.sun.position.set(e * 1.4, e * 2.2 + H, e); this.sun.target.position.set(0, H * 0.4, 0);
    this.controls.target.set(0, H * 0.45, 0); this.camera.position.set(d * 0.75, H * 0.55 + 1.2, d * 0.75); this.controls.update();
  }
}
global.PLANTS = PLANTS; global.PlantViewer = PlantViewer;
})(window);
