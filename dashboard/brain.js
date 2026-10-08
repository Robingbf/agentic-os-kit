// Brain: one canvas, six views of the same nodes.

// ===== SETTINGS: every speed and every quantity lives here (one number = one setting) =====
const CFG = {
  MAX_FPS: 60,              // frames per second cap
  MAX_DPR: 2,               // max resolution (Retina screens)
  TRANSITION_MS: 900,       // duration of a view change
  FLY_MS: 900,              // duration of a "fly to"
  FLY_ZOOM: 2.4,            // zoom at the end of a "fly to"
  FIT_PADDING: 30,          // margin (px) of the "fit" button
  ZOOM_MIN: 0.15,
  ZOOM_MAX: 8,
  ORBIT_DEG_PER_S: 7,       // rotation speed of the 3D orbit
  ORBIT_TILT_DEG: 24,       // orbit tilt
  ORBIT_PERSPECTIVE: 900,   // camera distance (smaller = stronger perspective)
  ORBIT_LAYER_GAP: 46,      // vertical gap between layers in 3D
  IDLE_DRIFT_PX: 1.6,       // idle drift amplitude
  IDLE_HZ: 0.12,            // idle drift frequency
  NODE_R: 2.6,              // base radius of a dot
  NODE_R_PER_LINK: 1.2,     // radius added per √(number of links)
  NODE_R_MAX: 9,
  APP_R: 11,                // radius of a project/app icon
  HUB_R: 9,                 // radius of an area hub
  ROOT_R: 18,               // radius of the central hexagon
  HIT_SLOP_PX: 5,           // hover tolerance (screen px)
  // Rings view (layers)
  RING_START: 62,           // radius where the first ring starts
  RING_ROW: 8.5,            // gap between two rows of dots in a ring
  RING_DOT: 8.5,            // gap between two dots on a row
  RING_BAND_GAP: 26,        // space between two rings
  RING_HUB_GAP: 22,         // space around the ring of area hubs
  RING_APPS_GAP: 34,        // space before the apps ring
  RING_TOP_GAP_DEG: 16,     // opening at the top for ring names
  RING_WEDGE_GAP_DEG: 5,    // space between two areas
  RING_MIN_WEDGE: 6,        // minimum weight of an area (in dots)
  RING_APP_WEIGHT: 4,       // a project/app weighs N dots (room for its icon)
  GLOW_PARTICLES: 160,      // particles of the central glow
  GLOW_R: 44,               // glow radius
  GLOW_SPEED: 0.35,         // angular speed of the particles (rad/s)
  // other views
  CIRCLE_R: 300,
  CIRCLE_BEND: 0.25,        // link bend towards the centre (0 = straight, 1 = through the centre)
  AREA_RING_R: 250,         // distance of clusters from the centre (areas view)
  CLUSTER_SPREAD: 11,
  FORCE_CHARGE: -80,        // repulsion (links view)
  FORCE_LINK_DIST: 34,
  FORCE_ALPHA_DECAY: 0.03,
  TIMELINE_W: 900,
  TIMELINE_GAP: 18,         // minimum distance between the axis and the dots
  TIMELINE_SWARM_TICKS: 120,
  TIMELINE_RUN_DAYS: 30,
  LABEL_PX: 10.5,           // label size (screen px)
  DIM_ALPHA: 0.1,           // opacity of what is not hovered
  ISOLATE_ALPHA: 0.035,     // opacity of what is filtered out
  SEARCH_RESULTS: 8,
  REFRESH_MS: 300000,       // reload of brain.json
  STALE_HOURS: 26,
};
// =====================================================================================

(() => {
  const KINDS = ["root", "area", "project", "app", "skill", "memory", "note", "routine", "run"];
  const KIND_GLYPH = { root: "⬡", area: "◉", project: "■", app: "⬟", skill: "▲", memory: "●", note: "○", routine: "◆", run: "✕" };
  const DEFAULT_RINGS = [{ id: "skills", label: "Skills" }, { id: "memory", label: "Memory" }, { id: "routines", label: "Routines" }, { id: "apps", label: "Applications" }];
  const RING_COLOR = { skills: "#ff9a52", memory: "#b49cff", routines: "#ffb36b", apps: "#9cc3ff" };
  const INK = "#e8e5de", MUTED = "#77746d", CORE = "#ff7a2f";
  const PALETTE = ["#6aa9ff", "#ffb04f", "#47d6a0", "#b48cff", "#ff6b8b", "#d9d9d9", "#4fd1d9", "#c7a07a"];
  const TAIL_AREAS = ["os", "archive"];  // always drawn after the user's areas
  const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
  window.AREA_COLOR = window.AREA_COLOR || {};

  const panel = document.getElementById("brain");
  const stage = panel.querySelector(".brain-stage");
  const canvas = stage.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const cardEl = stage.querySelector(".brain-card");
  const searchEl = panel.querySelector(".search input");
  const resultsEl = panel.querySelector(".results");

  let nodes = [], links = [], byId = new Map(), adj = new Map(), areaColor = new Map(), areas = [], areaCount = new Map();
  let rings = DEFAULT_RINGS, layers = [], areaLabel = new Map();
  let view = "rings", showNames = false, motion = true, isolate = null, hover = null, selected = null;
  let W = 0, H = 0, dpr = 1, transform = d3.zoomIdentity;
  let tween = null, sim = null, simNodes = null, orbitAngle = 0, decor = null;
  let rafId = 0, lastFrame = 0, visible = true, updatedAt = null;

  // logos (optional per area, URL given by brain.json) and Phosphor icons
  const logos = {};
  const logo = url => {
    if (!url || !url.startsWith("/")) return null;
    if (!logos[url]) { const im = new Image(); im.onload = () => kick(); im.src = url; logos[url] = im; }
    return logos[url];
  };
  const iconPaths = {};
  const PH = () => window.PH || {};
  const iconPath = n => iconPaths[n] || (iconPaths[n] = new Path2D(PH()[n] || PH()["folder-simple"] || "M32,32H224V224H32Z"));

  // central glow
  const glow = Array.from({ length: CFG.GLOW_PARTICLES }, () => ({
    a: Math.random() * 6.283, r: Math.sqrt(Math.random()) * CFG.GLOW_R, sp: (0.4 + Math.random()) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.283, s: 0.4 + Math.random() * 0.9,
  }));

  // ---------- data ----------
  async function load() {
    await window.AREA_PREFS;  // user-picked colours before the first draw
    let d;
    try {
      const r = await fetch("/data/brain.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 404 ? "no data yet" : `HTTP ${r.status}`);
      d = await r.json();
    } catch (e) { return header(null, e.message); }
    header(d.updated_at);
    if (d.updated_at === updatedAt) return;
    updatedAt = d.updated_at;
    const old = byId;
    nodes = d.nodes.map(n => {
      const o = old.get(n.id);
      return { ...n, x: o ? o.x : 0, y: o ? o.y : 0, tx: 0, ty: 0, phase: Math.random() * 6.283, depth: 0, s: 1 };
    });
    byId = new Map(nodes.map(n => [n.id, n]));
    links = d.links.filter(l => byId.has(l.s) && byId.has(l.t)).map(l => ({ s: byId.get(l.s), t: byId.get(l.t) }));
    adj = new Map(nodes.map(n => [n.id, new Set()]));
    links.forEach(l => { adj.get(l.s.id).add(l.t.id); adj.get(l.t.id).add(l.s.id); });
    nodes.forEach(n => {
      n.deg = adj.get(n.id).size;
      n.r = n.kind === "root" ? CFG.ROOT_R : n.kind === "area" ? CFG.HUB_R : (n.kind === "app" || n.kind === "project") ? CFG.APP_R
        : Math.min(CFG.NODE_R_MAX, CFG.NODE_R + CFG.NODE_R_PER_LINK * Math.sqrt(n.deg));
    });
    // rings (layers) and areas come from the data: brain.json → rings[], areas[]
    rings = Array.isArray(d.rings) && d.rings.length ? d.rings : DEFAULT_RINGS;
    const ringIds = rings.map(r => r.id);
    const extra = [...new Set(nodes.map(n => n.layer))].filter(l => l && l !== "core" && l !== "runs" && !ringIds.includes(l)).sort();
    if (extra.length) rings = [...rings, ...extra.map(id => ({ id, label: id }))];
    layers = ["core", ...rings.map(r => r.id), "runs"];
    const dataAreas = Array.isArray(d.areas) ? d.areas : [];
    areaLabel = new Map(dataAreas.map(a => [a.id, a.label || a.id]));
    nodes.filter(n => n.kind === "area" && !areaLabel.has(n.area)).forEach(n => areaLabel.set(n.area, n.label));
    const present = new Set(nodes.map(n => n.area).filter(a => a && a !== "core"));
    const order = dataAreas.map(a => a.id).filter(a => !TAIL_AREAS.includes(a));
    areas = [...order.filter(a => present.has(a)),
             ...[...present].filter(a => !order.includes(a) && !TAIL_AREAS.includes(a)).sort(),
             ...TAIL_AREAS.filter(a => present.has(a))];
    const dataColor = new Map(dataAreas.filter(a => a.color).map(a => [a.id, a.color]));
    areaColor = new Map(areas.map((a, i) => [a, window.AREA_COLOR[a] || dataColor.get(a) || PALETTE[i % PALETTE.length]]));
    areaColor.set("core", CORE);
    areaCount = new Map(areas.map(a => [a, nodes.filter(n => n.area === a && n.kind !== "area").length]));
    if (selected) selected = byId.get(selected.id) || null;
    if (hover) hover = byId.get(hover.id) || null;
    const runs = nodes.filter(n => n.kind === "run").length;
    panel.querySelector(".brain-counts").textContent = `${nodes.length - runs} nodes · ${links.length} links · ${runs} runs`;
    chips();
    setView(view, old.size === 0);
  }

  function header(ts, err) {
    const badge = panel.querySelector(".brain-badge"), tsEl = document.getElementById("brain-ts");
    if (!ts) { badge.textContent = err || "unavailable"; tsEl.textContent = "brain unavailable"; return; }
    const t = new Date(ts), h = (Date.now() - t) / 3.6e6, stale = !(h <= CFG.STALE_HOURS);
    const p = v => String(v).padStart(2, "0");
    const s = `${p(t.getDate())}.${p(t.getMonth() + 1)} ${p(t.getHours())}:${p(t.getMinutes())}`;
    tsEl.textContent = `brain ${s}${stale ? " · stale" : ""}`;
    tsEl.style.color = stale ? "var(--accent)" : "";
    badge.textContent = stale ? "brain stale" : "";
  }

  // ---------- views: each one sets a target (tx, ty) for every node ----------
  const byKindThenLabel = (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.label.localeCompare(b.label);
  const byAreaThenLabel = (a, b) => (areas.indexOf(a.area) - areas.indexOf(b.area)) || byKindThenLabel(a, b);

  // Rings: one slice of the disc per area, one ring per layer (order from brain.json, centre outwards).
  // Area hubs sit after the first ring; the "apps" ring holds project/app icons.
  function layoutRings() {
    const deg = Math.PI / 180, top = CFG.RING_TOP_GAP_DEG * deg, gap = CFG.RING_WEDGE_GAP_DEG * deg;
    const isApp = n => n.kind === "app" || n.kind === "project";
    const weight = a => {
      const mine = nodes.filter(n => n.area === a && n.kind !== "area");
      return Math.max(CFG.RING_MIN_WEDGE, mine.filter(n => !isApp(n)).length, mine.filter(isApp).length * CFG.RING_APP_WEIGHT);
    };
    const total = areas.reduce((s, a) => s + weight(a), 0) || 1;
    const avail = 2 * Math.PI - top - gap * Math.max(0, areas.length - 1);
    const wedge = new Map();
    let a0 = -Math.PI / 2 + top / 2;
    areas.forEach(a => { const span = avail * weight(a) / total; wedge.set(a, [a0, a0 + span]); a0 += span + gap; });

    const ringIds = rings.map(r => r.id);
    const fallback = ringIds.filter(id => id !== "apps").slice(-1)[0] || ringIds[0];
    const bandOf = n => {
      if (n.kind === "root") return "root";
      if (n.kind === "area") return "hub";
      const l = n.layer === "runs" ? "routines" : n.layer;
      return ringIds.includes(l) ? l : fallback;
    };
    const groups = new Map();
    nodes.forEach(n => { const key = `${bandOf(n)}|${n.area}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(n); });
    groups.forEach(g => g.sort(byKindThenLabel));

    // Fills a ring: concentric rows, dots centred in each slice.
    function band(name, r0) {
      let maxRows = 0;
      areas.forEach(a => {
        const list = groups.get(`${name}|${a}`) || [];
        const [w0, w1] = wedge.get(a);
        let i = 0, row = 0;
        while (i < list.length) {
          const r = r0 + row * CFG.RING_ROW;
          const cap = Math.max(1, Math.floor((w1 - w0) * r / CFG.RING_DOT));
          const take = list.slice(i, i + cap), step = CFG.RING_DOT / r, mid = (w0 + w1) / 2;
          take.forEach((n, j) => { const ang = mid + (j - (take.length - 1) / 2) * step; n.tx = Math.cos(ang) * r; n.ty = Math.sin(ang) * r; });
          i += take.length; row++;
        }
        maxRows = Math.max(maxRows, row);
      });
      return { r0, r1: r0 + Math.max(0, maxRows - 1) * CFG.RING_ROW, used: maxRows > 0 };
    }

    const circles = [], labels = [];
    let edge = null, gapNext = 0, hubR = null;  // edge = outer radius of the last thing placed
    const placeHubs = () => {
      hubR = edge === null ? CFG.RING_START : edge + CFG.RING_HUB_GAP;
      areas.forEach(a => { const [w0, w1] = wedge.get(a), m = (w0 + w1) / 2; (groups.get(`hub|${a}`) || []).forEach(n => { n.tx = Math.cos(m) * hubR; n.ty = Math.sin(m) * hubR; }); });
      circles.push({ r: hubR, a: 0.08, dash: true });
      edge = hubR; gapNext = CFG.RING_HUB_GAP;
    };
    const hubsAt = ringIds.length > 1 ? 1 : 0;
    ringIds.forEach((id, i) => {
      if (i === hubsAt) placeHubs();
      if (id === "apps") {
        const R = edge === null ? CFG.RING_START : edge + CFG.RING_APPS_GAP;
        let used = false;
        areas.forEach(a => {
          const list = groups.get(`apps|${a}`) || [], [w0, w1] = wedge.get(a);
          used = used || list.length > 0;
          list.forEach((n, j) => { const ang = w0 + (w1 - w0) * (j + 0.5) / list.length; n.tx = Math.cos(ang) * R; n.ty = Math.sin(ang) * R; });
        });
        if (used) { circles.push({ r: R, a: 0.16 }); labels.push({ r: R, key: id }); edge = R + CFG.APP_R; gapNext = CFG.RING_BAND_GAP; }
        return;
      }
      const b = band(id, edge === null ? CFG.RING_START : edge + gapNext);
      if (b.used) {
        circles.push({ r: b.r1 + CFG.RING_ROW, a: 0.05 });
        labels.push({ r: (b.r0 + b.r1) / 2, key: id });
        edge = b.r1; gapNext = CFG.RING_BAND_GAP;
      }
    });
    if (hubR === null) placeHubs();
    nodes.filter(n => n.kind === "root").forEach(n => { n.tx = 0; n.ty = 0; });
    decor = { rings: circles, ringLabels: labels, glow: true, hubs: true };
  }

  function layoutCircle() {
    const list = [...nodes].sort(byAreaThenLabel);
    list.forEach((n, j) => { const a = (j / list.length) * 2 * Math.PI - Math.PI / 2; n.tx = Math.cos(a) * CFG.CIRCLE_R; n.ty = Math.sin(a) * CFG.CIRCLE_R; });
    decor = { rings: [{ r: CFG.CIRCLE_R, a: 0.06 }], bend: true };
  }

  function areaCenters() {
    return new Map(areas.map((a, i) => { const ang = (i / areas.length) * 2 * Math.PI - Math.PI / 2; return [a, [Math.cos(ang) * CFG.AREA_RING_R, Math.sin(ang) * CFG.AREA_RING_R]]; }));
  }

  function layoutAreas() {
    const centers = areaCenters(), count = new Map();
    [...nodes].sort(byAreaThenLabel).forEach(n => {
      if (n.kind === "root" || !centers.has(n.area)) { n.tx = 0; n.ty = 0; return; }
      const [cx, cy] = centers.get(n.area);
      if (n.kind === "area") { n.tx = cx; n.ty = cy; return; }
      const i = (count.get(n.area) || 0) + 1; count.set(n.area, i);
      const r = CFG.CLUSTER_SPREAD * Math.sqrt(i) + 14, a = i * 2.39996;
      n.tx = cx + Math.cos(a) * r; n.ty = cy + Math.sin(a) * r;
    });
    decor = { hubs: true, glow: true };
  }

  function startForce() {
    simNodes = nodes.map(n => ({ id: n.id, x: n.x, y: n.y, r: n.r }));
    const idx = new Map(simNodes.map(s => [s.id, s]));
    sim = d3.forceSimulation(simNodes)
      .force("link", d3.forceLink(links.map(l => ({ source: idx.get(l.s.id), target: idx.get(l.t.id) }))).distance(CFG.FORCE_LINK_DIST))
      .force("charge", d3.forceManyBody().strength(CFG.FORCE_CHARGE))
      .force("x", d3.forceX(0).strength(0.04)).force("y", d3.forceY(0).strength(0.04))
      .force("collide", d3.forceCollide(s => s.r + 2))
      .alphaDecay(CFG.FORCE_ALPHA_DECAY)
      .stop(); // stepped by the render loop
    simNodes.forEach((s, i) => { nodes[i].tx = s.x; nodes[i].ty = s.y; });
    decor = null;
  }

  // Swarm: each dot aims at its x (its date) and moves away from the axis without overlapping others.
  function swarm(list, xOf, side) {
    const g = CFG.TIMELINE_GAP;
    const ps = list.map(n => ({ n, fx0: xOf(n), x: xOf(n), y: side * (g + n.r) }));
    const s = d3.forceSimulation(ps).force("x", d3.forceX(p => p.fx0).strength(1)).force("y", d3.forceY(side * g).strength(0.05))
      .force("c", d3.forceCollide(p => p.n.r + 1.5)).stop();
    for (let i = 0; i < CFG.TIMELINE_SWARM_TICKS; i++) {
      s.tick();
      ps.forEach(p => { p.y = side > 0 ? Math.max(p.y, g + p.n.r) : Math.min(p.y, -g - p.n.r); });
    }
    ps.forEach(p => { p.n.tx = p.x; p.n.ty = p.y; });
  }

  function layoutTimeline() {
    const TW = CFG.TIMELINE_W, x0 = -TW / 2, x1 = TW / 2, now = Date.now(), DAY = 864e5;
    const today = d3.timeDay.ceil(new Date());
    const runX = d3.scaleTime().domain([d3.timeDay.offset(today, -CFG.TIMELINE_RUN_DAYS), today]).range([x0, x1]);
    const runs = nodes.filter(n => n.kind === "run"), files = nodes.filter(n => n.kind !== "run" && n.changed), undated = nodes.filter(n => n.kind !== "run" && !n.changed);
    const maxAge = Math.max(1, d3.max(files, n => (now - new Date(n.changed)) / DAY) || 1);
    const fileX = age => x1 - Math.sqrt(Math.min(age, maxAge) / maxAge) * TW;
    swarm(runs, n => Math.max(x0, runX(new Date(n.changed))), -1);
    swarm(files, n => fileX((now - new Date(n.changed)) / DAY), 1);
    undated.forEach((n, i) => { n.tx = x0 - 30; n.ty = CFG.TIMELINE_GAP + i * 2 * CFG.NODE_R_MAX; });
    const ages = [[0, "today"], [1, "1 d"], [7, "1 wk"], [30, "1 mo"], [90, "3 mo"], [180, "6 mo"], [365, "1 yr"], [730, "2 yrs"]].filter(([a]) => a <= maxAge);
    const topY = d3.min(runs, n => n.ty) ?? -60, bottom = d3.max(files, n => n.ty) ?? 60;
    decor = {
      axes: [[x0, 0, x1, 0]],
      labels: [
        { x: 0, y: topY - 18, text: `ROUTINE RUNS · LAST ${CFG.TIMELINE_RUN_DAYS} DAYS` },
        { x: 0, y: bottom + 22, text: "FILES BY LAST CHANGE", low: true },
        ...runX.ticks(5).map(t => ({ x: runX(t), y: -5, text: d3.timeFormat("%d.%m")(t) })),
        ...ages.map(([a, t]) => ({ x: fileX(a), y: 5, text: t, low: true })),
      ],
    };
  }

  function orbitBase() {
    const centers = areaCenters(), count = new Map();
    nodes.forEach(n => {
      const li = n.kind === "root" ? 0 : Math.max(0, layers.indexOf(n.layer));
      n.Y = (li - (layers.length - 1) / 2) * CFG.ORBIT_LAYER_GAP;
      if (n.kind === "root" || !centers.has(n.area)) { n.X = 0; n.Z = 0; return; }
      const [cx, cz] = centers.get(n.area);
      const i = (count.get(n.area) || 0) + 1; count.set(n.area, i);
      const r = n.kind === "area" ? 0 : CFG.CLUSTER_SPREAD * Math.sqrt(i) + 10, a = i * 2.39996;
      n.X = cx * 0.8 + Math.cos(a) * r; n.Z = cz * 0.8 + Math.sin(a) * r;
    });
    decor = null;
  }

  function projectOrbit() {
    const a = orbitAngle, t = CFG.ORBIT_TILT_DEG * Math.PI / 180, P = CFG.ORBIT_PERSPECTIVE;
    const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(t), st = Math.sin(t);
    nodes.forEach(n => {
      const x = n.X * ca - n.Z * sa, z = n.X * sa + n.Z * ca;
      const y = n.Y * ct - z * st, zz = n.Y * st + z * ct, s = P / (P + zz);
      n.tx = x * s; n.ty = y * s; n.s = s; n.depth = zz;
    });
  }

  function setView(v, instant) {
    view = v;
    panel.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v));
    if (sim) { sim.stop(); sim = null; }
    nodes.forEach(n => { n.s = 1; n.depth = 0; });
    ({ rings: layoutRings, circle: layoutCircle, areas: layoutAreas, links: startForce, timeline: layoutTimeline,
       orbit: () => { orbitBase(); projectOrbit(); } })[v]();
    tween = instant ? null : { t0: performance.now(), from: nodes.map(n => [n.x, n.y]) };
    if (instant) { nodes.forEach(n => { n.x = n.tx; n.y = n.ty; }); fit(true); }
    kick();
  }

  // ---------- render loop (only runs while something moves) ----------
  function busy() { return !!tween || (sim && sim.alpha() > sim.alphaMin()) || (motion && !(view === "orbit" && selected)); }
  function kick() { if (!rafId) rafId = requestAnimationFrame(frame); }

  function frame(now) {
    rafId = 0;
    if (!visible) return;
    if (now - lastFrame < 1000 / CFG.MAX_FPS - 1) { rafId = requestAnimationFrame(frame); return; }
    const dt = lastFrame ? Math.min(100, now - lastFrame) : 16;
    lastFrame = now;
    step(now, dt);
    draw(now);
    if (busy()) rafId = requestAnimationFrame(frame); else lastFrame = 0;
  }

  function step(now, dt) {
    if (view === "orbit") {
      if (motion && !selected) orbitAngle += CFG.ORBIT_DEG_PER_S * Math.PI / 180 * dt / 1000;
      projectOrbit();
    }
    if (sim) { sim.tick(); simNodes.forEach((s, i) => { nodes[i].tx = s.x; nodes[i].ty = s.y; }); }
    if (tween) {
      const p = Math.min(1, (now - tween.t0) / CFG.TRANSITION_MS), e = d3.easeCubicInOut(p);
      nodes.forEach((n, i) => { const [fx, fy] = tween.from[i]; n.x = fx + (n.tx - fx) * e; n.y = fy + (n.ty - fy) * e; });
      if (p >= 1) tween = null;
    } else nodes.forEach(n => { n.x = n.tx; n.y = n.ty; });
    const drift = motion && (view === "rings" || view === "circle" || view === "areas");
    const w = now / 1000 * CFG.IDLE_HZ * 2 * Math.PI;
    nodes.forEach(n => {
      const still = n.kind === "root" || n.kind === "area" || n.kind === "app" || n.kind === "project";
      n.px = n.x + (drift && !still ? CFG.IDLE_DRIFT_PX * Math.sin(w + n.phase) : 0);
      n.py = n.y + (drift && !still ? CFG.IDLE_DRIFT_PX * Math.cos(w * 0.8 + n.phase) : 0);
      n.pr = n.r * n.s;
    });
    if (motion) glow.forEach(g => { g.a += g.sp * CFG.GLOW_SPEED * dt / 1000; });
  }

  const visibleNode = n => !isolate || n[isolate.type] === isolate.value;

  function text(t, x, y, px, color, align = "center", base = "middle") {
    ctx.font = `${px / transform.k}px ${MONO}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(t, x, y);
  }

  function draw(now) {
    const k = transform.k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * transform.x, dpr * transform.y);
    ctx.lineWidth = 1 / k;

    // central glow
    if (decor && decor.glow) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, CFG.GLOW_R * 1.6);
      g.addColorStop(0, "rgba(255,122,47,0.32)"); g.addColorStop(0.5, "rgba(255,122,47,0.08)"); g.addColorStop(1, "rgba(255,122,47,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, CFG.GLOW_R * 1.6, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      const t = now / 1000;
      ctx.fillStyle = "#ff8a3d";
      glow.forEach(p => {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + p.ph);
        ctx.fillRect(Math.cos(p.a) * p.r, Math.sin(p.a) * p.r, p.s, p.s);
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }

    // decoration
    if (decor && decor.rings) decor.rings.forEach(r => {
      ctx.strokeStyle = `rgba(255,255,255,${r.a})`; ctx.setLineDash(r.dash ? [3 / k, 5 / k] : []);
      ctx.beginPath(); ctx.arc(0, 0, r.r, 0, 6.283); ctx.stroke();
    });
    ctx.setLineDash([]);
    if (decor && decor.axes) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      decor.axes.forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
    }
    if (decor && decor.labels) decor.labels.forEach(l => text(l.text, l.x, l.y, CFG.LABEL_PX, MUTED, "center", l.low ? "top" : "alphabetic"));

    const focus = hover || selected, near = focus ? adj.get(focus.id) : null;
    const lit = n => !focus || n === focus || near.has(n.id);

    // links
    const bend = decor && decor.bend ? CFG.CIRCLE_BEND : 0;
    const path = l => {
      ctx.moveTo(l.s.px, l.s.py);
      if (bend) ctx.quadraticCurveTo((l.s.px + l.t.px) / 2 * (1 - bend), (l.s.py + l.t.py) / 2 * (1 - bend), l.t.px, l.t.py);
      else ctx.lineTo(l.t.px, l.t.py);
    };
    const shown = links.filter(l => visibleNode(l.s) && visibleNode(l.t) && (view !== "timeline" || l.s === focus || l.t === focus));
    ctx.beginPath();
    shown.forEach(l => { if (!(focus && (l.s === focus || l.t === focus))) path(l); });
    ctx.strokeStyle = `rgba(200,205,215,${focus ? 0.04 : view === "rings" ? 0.07 : 0.14})`; ctx.stroke();
    if (focus) {
      ctx.beginPath(); shown.forEach(l => { if (l.s === focus || l.t === focus) path(l); });
      ctx.strokeStyle = "rgba(255,170,110,0.8)"; ctx.lineWidth = 1.3 / k; ctx.stroke(); ctx.lineWidth = 1 / k;
    }

    // nodes
    const order = view === "orbit" ? [...nodes].sort((a, b) => b.depth - a.depth) : nodes;
    order.forEach(n => {
      const a = !visibleNode(n) ? CFG.ISOLATE_ALPHA : lit(n) ? 1 : CFG.DIM_ALPHA;
      ctx.globalAlpha = view === "orbit" ? a * Math.max(0.35, Math.min(1, n.s * 1.1)) : a;
      shape(n);
      if (n === selected || n === hover) {
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5 / k;
        ctx.beginPath(); ctx.arc(n.px, n.py, n.pr + 4 / k, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1 / k;
      }
    });
    ctx.globalAlpha = 1;

    // ring names, in the opening at the top
    if (decor && decor.ringLabels) decor.ringLabels.forEach(l => {
      const ring = rings.find(r => r.id === l.key) || { label: l.key }, i = rings.indexOf(ring);
      const t = String(ring.label || l.key).toUpperCase(), c = RING_COLOR[l.key] || PALETTE[Math.max(0, i) % PALETTE.length];
      ctx.font = `600 ${10.5 / k}px ${MONO}`;
      const w = ctx.measureText(t).width + 12 / k;
      ctx.fillStyle = "rgba(10,12,15,0.85)"; ctx.fillRect(-w / 2, -l.r - 8 / k, w, 16 / k);
      text(t, 0, -l.r, 10.5, c);
    });

    // permanent labels (root, areas); other names on hover or when "names" is on
    order.forEach(n => {
      if (!visibleNode(n)) return;
      if (n.kind === "root") { text(n.label.toUpperCase(), n.px, n.py + n.pr + 12 / k, 11, INK); return; }
      if (n.kind === "area" && decor && decor.hubs) {
        ctx.globalAlpha = lit(n) ? 1 : 0.3;
        // name turned outwards, so it does not overlap the neighbour
        const ang = Math.atan2(n.py, n.px), right = Math.cos(ang) >= 0, d = n.pr + 5 / k;
        text(`${String(areaLabel.get(n.area) || n.area).toUpperCase()} ${areaCount.get(n.area) || 0}`, n.px + (right ? d : -d), n.py, 10.5, INK, right ? "left" : "right");
        ctx.globalAlpha = 1; return;
      }
      const show = (showNames && lit(n)) || n === focus || (focus && near.has(n.id) && !showNames);
      if (show) text(n.label, n.px + n.pr + 3 / k, n.py, CFG.LABEL_PX, n === focus ? INK : "rgba(232,229,222,0.8)", "left");
    });
  }

  function shape(n) {
    const { kind, px: x, py: y, pr: r } = n, k = transform.k, color = areaColor.get(n.area) || CORE;
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.beginPath();
    const poly = (sides, rot, rr = r) => { for (let i = 0; i < sides; i++) { const a = rot + i * 2 * Math.PI / sides; i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); };
    switch (kind) {
      case "root":
        poly(6, Math.PI / 6); ctx.fillStyle = "rgba(255,122,47,0.12)"; ctx.fill();
        ctx.strokeStyle = CORE; ctx.lineWidth = 2 / k; ctx.stroke(); ctx.lineWidth = 1 / k; break;
      case "area":
        ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        text(String(areaLabel.get(n.area) || n.area || "?")[0].toUpperCase(), x, y + 0.5 / k, 10, "#0a0c0f"); break;
      case "app": case "project": {
        ctx.arc(x, y, r, 0, 6.283); ctx.fillStyle = "#11151b"; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.2 / k; ctx.stroke(); ctx.lineWidth = 1 / k;
        const im = logo(n.logo);
        if (im && im.complete && im.naturalWidth) {
          ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, 6.283); ctx.clip();
          ctx.drawImage(im, x - r * 0.78, y - r * 0.78, r * 1.56, r * 1.56); ctx.restore();
        } else {
          const s = (r * 1.15) / 256;
          ctx.save(); ctx.translate(x - 128 * s, y - 128 * s); ctx.scale(s, s); ctx.fillStyle = color; ctx.fill(iconPath(n.icon || (n.kind === "app" ? "app-window" : "folder-simple"))); ctx.restore();
        }
        break;
      }
      case "skill": poly(3, -Math.PI / 2, r * 1.2); ctx.fill(); break;
      case "routine": poly(4, 0, r * 1.15); ctx.fill(); break;
      case "note": ctx.arc(x, y, r * 0.85, 0, 6.283); ctx.lineWidth = Math.max(1 / k, r * 0.35); ctx.stroke(); ctx.lineWidth = 1 / k; break;
      case "run": {
        const d = r * 0.8;
        ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d);
        ctx.lineWidth = Math.max(1 / k, r * 0.4);
        if (n.status && n.status !== "ok") ctx.strokeStyle = "#ff5a4f";
        ctx.stroke(); ctx.lineWidth = 1 / k; break;
      }
      default: ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    }
  }

  // ---------- camera ----------
  const zoom = d3.zoom().scaleExtent([CFG.ZOOM_MIN, CFG.ZOOM_MAX]).on("zoom", e => { transform = e.transform; kick(); });
  const sel = d3.select(canvas).call(zoom).on("dblclick.zoom", null);

  function fit(instant) {
    const pts = nodes.filter(visibleNode);
    if (!pts.length || !W) return;
    const [x0, x1] = d3.extent(pts, n => n.tx), [y0, y1] = d3.extent(pts, n => n.ty);
    const m = CFG.APP_R + 14;
    const kk = Math.max(CFG.ZOOM_MIN, Math.min(CFG.ZOOM_MAX, Math.min((W - 2 * CFG.FIT_PADDING) / (x1 - x0 + 2 * m || 1), (H - 2 * CFG.FIT_PADDING) / (y1 - y0 + 2 * m || 1))));
    const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(kk).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    instant ? sel.call(zoom.transform, t) : sel.transition().duration(CFG.FLY_MS).call(zoom.transform, t);
  }

  function flyTo(n) {
    const kk = Math.max(transform.k, CFG.FLY_ZOOM);
    const cx = cardEl.hidden ? W / 2 : (W - cardEl.offsetWidth - 16) / 2; // centre the free space, left of the card
    sel.transition().duration(CFG.FLY_MS).call(zoom.transform, d3.zoomIdentity.translate(Math.max(60, cx), H / 2).scale(kk).translate(-n.tx, -n.ty));
  }

  // ---------- interaction ----------
  function pick(ev) {
    const [mx, my] = d3.pointer(ev, canvas);
    const wx = (mx - transform.x) / transform.k, wy = (my - transform.y) / transform.k;
    let best = null, bd = Infinity;
    nodes.forEach(n => {
      if (!visibleNode(n) || n.px === undefined) return;
      const d = Math.hypot(n.px - wx, n.py - wy);
      if (d < n.pr + CFG.HIT_SLOP_PX / transform.k && d < bd) { best = n; bd = d; }
    });
    return best;
  }

  canvas.addEventListener("mousemove", ev => { const n = pick(ev); if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "grab"; kick(); } });
  canvas.addEventListener("mouseleave", () => { if (hover) { hover = null; kick(); } });
  canvas.addEventListener("click", ev => select(pick(ev)));

  function select(n, fly) {
    selected = n || null;
    cardEl.hidden = !n;
    if (n) renderCard(n);
    if (n && fly) flyTo(n);
    kick();
  }

  function renderCard(n) {
    cardEl.replaceChildren();
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const close = el("button", "brain-close", "×"); close.title = "Close"; close.onclick = () => select(null);
    cardEl.append(close, el("h3", null, n.label));
    cardEl.append(el("p", "brain-meta", `${n.kind} · ${areaLabel.get(n.area) || n.area} · ${n.layer} · ${n.deg} link${n.deg === 1 ? "" : "s"}${n.changed ? " · " + new Date(n.changed).toLocaleDateString() : ""}`));
    cardEl.append(el("p", n.note ? null : "empty", n.note || "No note."));
    if (n.path) cardEl.append(el("code", "brain-path", n.path));
    const bar = el("div", "brain-actions"), pre = el("pre", "brain-file");
    pre.hidden = true;
    if (n.path) {
      const open = el("button", "pill", "open");
      open.onclick = async () => {
        pre.hidden = false; pre.textContent = "Reading…";
        try { const r = await fetch(`/file?id=${encodeURIComponent(n.id)}`); pre.textContent = r.ok ? await r.text() : `Refused (HTTP ${r.status})`; }
        catch { pre.textContent = "Network error"; }
      };
      const copy = el("button", "pill", "copy path");
      copy.onclick = async () => { try { await navigator.clipboard.writeText(n.path); copy.textContent = "copied ✓"; } catch { copy.textContent = "copy failed"; } };
      bar.append(open, copy);
      // preview: .md / .txt documents (preview + edit) and folders (browsable list) in the right-side panel
      const isDoc = /\.(md|txt)$/i.test(n.path), maybeDir = n.path.startsWith("/") && !/\.[a-z0-9]{1,6}$/i.test(n.path);
      if ((isDoc || maybeDir) && window.openMdPreview) {
        const prev = el("button", "pill", "preview");
        prev.style.borderColor = "var(--accent)"; prev.style.color = "var(--accent)";
        prev.onclick = () => isDoc ? window.openMdPreview(n.id, n.label) : window.openPathPreview(n.path, n.label);
        bar.prepend(prev);
      }
    }
    const fly = el("button", "pill", "fly to"); fly.onclick = () => flyTo(n);
    bar.append(fly);
    cardEl.append(bar, pre);
  }

  // search
  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    resultsEl.replaceChildren();
    if (!q) return;
    nodes.filter(n => [n.label, n.path, n.note].some(f => f && f.toLowerCase().includes(q))).slice(0, CFG.SEARCH_RESULTS).forEach(n => {
      const b = document.createElement("button");
      b.textContent = `${KIND_GLYPH[n.kind] || "•"} ${n.label}`; b.title = n.path || "";
      b.onclick = () => { resultsEl.replaceChildren(); searchEl.value = n.label; select(n, true); };
      resultsEl.append(b);
    });
  });
  searchEl.addEventListener("keydown", e => {
    if (e.key === "Enter") { const b = resultsEl.querySelector("button"); if (b) b.click(); }
    if (e.key === "Escape") { searchEl.value = ""; resultsEl.replaceChildren(); }
  });

  // chips: a click isolates an area or a kind; "all areas" shows everything again
  function chips() {
    const areaEl = panel.querySelector(".brain-areas"), kindEl = panel.querySelector(".brain-kinds");
    const chip = (parent, type, value, dot, label) => {
      const b = document.createElement("button");
      b.className = "chip";
      const on = type ? !!(isolate && isolate.type === type && isolate.value === value) : !isolate;
      b.setAttribute("aria-pressed", on);
      if (dot) {
        b.style.setProperty("--chip", dot);
        if (type === "area") {  // clickable swatch: pick the area colour
          const sw = document.createElement("label");
          sw.className = "swatch"; sw.style.background = dot; sw.title = "Change this area's colour";
          const inp = document.createElement("input");
          inp.type = "color"; inp.value = dot;
          inp.addEventListener("click", e => e.stopPropagation());
          inp.addEventListener("input", e => setAreaColor(value, e.target.value));
          sw.addEventListener("click", e => e.stopPropagation());
          sw.append(inp); b.append(sw);
        } else { const i = document.createElement("i"); i.style.background = dot; b.append(i); }
      }
      b.append(document.createTextNode(label));
      b.onclick = () => { isolate = !type || on ? null : { type, value }; chips(); kick(); };
      parent.append(b);
    };
    areaEl.replaceChildren(); kindEl.replaceChildren();
    chip(areaEl, null, null, null, "all areas");
    areas.forEach(a => chip(areaEl, "area", a, areaColor.get(a), `${areaLabel.get(a) || a} ${areaCount.get(a) || 0}`));
    const custom = Object.keys(window.AREA_COLOR).some(k => window.AREA_COLOR[k] !== (window.AREA_COLOR_DEFAULT || {})[k]);
    if (custom) {
      const r = document.createElement("button");
      r.className = "chip reset"; r.textContent = "default colours";
      r.onclick = () => { Object.assign(window.AREA_COLOR, window.AREA_COLOR_DEFAULT); applyColors(true); };
      areaEl.append(r);
    }
    KINDS.filter(k => nodes.some(n => n.kind === k)).forEach(k => chip(kindEl, "kind", k, null, `${KIND_GLYPH[k]} ${k}`));
  }

  // area colours: applied at once, saved lightly (state/prefs.json)
  let colorTimer;
  function applyColors(save) {
    areas.forEach(a => areaColor.set(a, window.AREA_COLOR[a] || areaColor.get(a)));
    chips(); kick();
    window.dispatchEvent(new Event("areacolors"));
    if (!save) return;
    clearTimeout(colorTimer);
    colorTimer = setTimeout(() => {
      const custom = Object.fromEntries(Object.entries(window.AREA_COLOR).filter(([k, v]) => v !== (window.AREA_COLOR_DEFAULT || {})[k]));
      fetch("/prefs", { method: "POST", headers: { "X-Dashboard": "1", "Content-Type": "application/json" }, body: JSON.stringify({ area_colors: custom }) }).catch(() => {});
    }, 400);
  }
  // colour changed elsewhere (project page): the brain follows without saving again
  window.addEventListener("projectcolor", e => {
    const { area, color } = e.detail || {};
    if (!area || !areaColor.has(area)) return;
    areaColor.set(area, color);
    chips(); kick();
  });
  function setAreaColor(area, color) {
    window.AREA_COLOR[area] = color;
    areaColor.set(area, color);
    kick();
    clearTimeout(setAreaColor.t);
    setAreaColor.t = setTimeout(() => applyColors(true), 250);  // chips are redrawn when the picker is released
  }

  // toolbar
  panel.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  const toggle = (name, get, set) => {
    const b = panel.querySelector(`[data-toggle="${name}"]`);
    b.setAttribute("aria-pressed", get());
    b.addEventListener("click", () => { set(!get()); b.setAttribute("aria-pressed", get()); kick(); });
  };
  toggle("names", () => showNames, v => showNames = v);
  toggle("motion", () => motion, v => motion = v);
  panel.querySelector("[data-act=fit]").addEventListener("click", () => fit());
  panel.querySelector("[data-act=full]").addEventListener("click", () => {
    document.fullscreenElement ? document.exitFullscreen() : panel.requestFullscreen().catch(() => {});
  });

  // size, visibility
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const first = !W;
    dpr = Math.min(CFG.MAX_DPR, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (first && nodes.length) fit(true);
    kick();
  }
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });

  resize();
  load();
  setInterval(load, CFG.REFRESH_MS);
})();
