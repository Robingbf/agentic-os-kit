// Agentic OS dashboard: top bar, side columns, pages and layout. The brain graph lives in brain.js.
// Everything personal comes from /config.json (os.config.json minus private keys); nothing is hard-coded here.

// Phosphor icon helper (the vendor bundle only ships window.PH = {name: path}).
window.ph = window.ph || ((n, cls = "ph") => `<svg class="${cls}" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="${(window.PH || {})[n] || ""}"/></svg>`);

// Validated categorical palette (dark background): fixed order, colour-blind safe, contrast >= 3:1.
const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#8a63d2", "#77746d"];

const CONFIG_DEFAULTS = {
  name: "My OS", tagline: "Agentic OS", timezone: "", claude_plan: "pro",
  currency: { code: "USD", symbol: "$", usd_rate: 1 },
  clocks: [],
  panels: { today: true, next_days: false, inbox: false, capture: true, waiting: false, skills: true, routines: true },
  today: { widgets: ["clock", "clocks", "goal", "quarters"], goal_label: "Next milestone" },
  topbar: { machine_health: true, claude_usage: true, search: true },
  pages: [{ id: "brain" }],
  areas: [],
  mail: { enabled: false, watch: { interval_min: 30 }, labels: [], fallback_by_area: {} },
  dashboard: { accent: "#ff7a2f", tone: "inform" },
};
function mergeConfig(c) {
  c = c && typeof c === "object" ? c : {};
  const out = { ...CONFIG_DEFAULTS, ...c };
  for (const k of ["currency", "panels", "today", "topbar", "mail", "dashboard"]) out[k] = { ...CONFIG_DEFAULTS[k], ...(c[k] && typeof c[k] === "object" ? c[k] : {}) };
  for (const k of ["clocks", "pages", "areas"]) if (!Array.isArray(out[k])) out[k] = CONFIG_DEFAULTS[k];
  if (!Array.isArray(out.today.widgets)) out.today.widgets = CONFIG_DEFAULTS.today.widgets;
  return out;
}

// Area colours: the same everywhere (brain, tags, projects). brain.js reads these globals.
window.AREA_COLOR_DEFAULT = {};
window.AREA_COLOR = {};
window.AREA_LABEL = {};
window.OS_CONFIG_READY = fetch("/config.json", { cache: "no-store" }).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(c => {
  const cfg = mergeConfig(c);
  window.OS_CONFIG = cfg;
  cfg.areas.forEach((a, i) => {
    if (!a || !a.id) return;
    window.AREA_COLOR_DEFAULT[a.id] = /^#[0-9a-f]{6}$/i.test(a.color || "") ? a.color : PALETTE[i % PALETTE.length];
    window.AREA_LABEL[a.id] = a.label || a.id;
  });
  // OS-wide pseudo-areas used by the brain graph: neutral colours unless the config defines them
  for (const [id, color, label] of [["os", "#77746d", "OS"], ["archive", "#5c5a55", "Archive"]]) {
    if (!(id in window.AREA_COLOR_DEFAULT)) { window.AREA_COLOR_DEFAULT[id] = color; window.AREA_LABEL[id] = label; }
  }
  Object.assign(window.AREA_COLOR, window.AREA_COLOR_DEFAULT);
  return cfg;
});
// Colours picked by the user (state/prefs.json) override the config ones.
window.AREA_PREFS = window.OS_CONFIG_READY
  .then(() => fetch("/state/prefs.json", { cache: "no-store" })).then(r => r.ok ? r.json() : {}).catch(() => ({}))
  .then(p => { Object.assign(window.AREA_COLOR, (p && p.area_colors) || {}); return p; });

const APP = {
  REFRESH_MS: 60000,         // re-read the JSON files
  STALE_MIN: { "inbox-live": 30, digest: 24 * 60, today: 15, routines: 15, "memory-map": 26 * 60 },
  RUNNER_LATE_MIN: 10,       // runner turns orange after this
  DAYS_AHEAD: 14,
  LAYOUT_KEY: "aos-layout",
  // Known hosts: other links stay clickable but are flagged with a warning (phishing risk).
  SAFE_HOSTS: ["mail.google.com", "calendar.google.com", "drive.google.com", "docs.google.com", "github.com", "gitlab.com",
    "dashboard.stripe.com", "supabase.com", "app.posthog.com", "us.posthog.com", "eu.posthog.com", "trello.com", "notion.so",
    "www.notion.so", "linear.app", "vercel.com", "play.google.com", "appstoreconnect.apple.com", "developer.apple.com", "outlook.office.com"],
  KIND_ICON: { email: "envelope", admin: "file-text", store: "device-mobile", payment: "lightning", alert: "warning", calendar: "calendar-blank", info: "globe" },
};

// Icons declared in HTML: <span data-ic="name">
function icons(root = document) {
  root.querySelectorAll("[data-ic]:not([data-ic-done])").forEach(el => { el.insertAdjacentHTML("afterbegin", ph(el.dataset.ic)); el.dataset.icDone = "1"; });
}
icons();

(async () => {
  const CFG = await window.OS_CONFIG_READY;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const ddmm = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const parseDay = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const ageMin = iso => (Date.now() - new Date(iso)) / 60000;
  const homeTilde = p => String(p || "").replace(/^\/(Users|home)\/[^/]+/, "~");
  const POST = (url, body, json = true) => fetch(url, { method: "POST", headers: { "X-Dashboard": "1", ...(json ? { "Content-Type": "application/json" } : {}) }, body: json && body !== undefined ? JSON.stringify(body) : body });

  // ---------- money: API prices are in USD, shown in the configured currency ----------
  const CUR = { code: String(CFG.currency.code || "USD").toUpperCase(), symbol: CFG.currency.symbol || "$", rate: +CFG.currency.usd_rate || 1 };
  const fmtCur = (v, code = CUR.code, digits = 2) => {
    if (v == null || isNaN(v)) return "–";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v); }
    catch { return `${code === CUR.code ? CUR.symbol : code + " "}${Number(v).toFixed(digits)}`; }
  };
  const money = (usd, digits = 2) => usd == null ? "–" : fmtCur(usd * CUR.rate, CUR.code, digits);
  const num = v => v == null ? "–" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

  // ---------- branding + accent ----------
  document.title = CFG.name || "Agentic OS";
  $("brand-name").textContent = String(CFG.name || "My OS").toUpperCase();
  $("brand-tag").textContent = CFG.tagline || "";
  const accent = /^#[0-9a-f]{6}$/i.test(CFG.dashboard.accent || "") ? CFG.dashboard.accent : "#ff7a2f";
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-dim", `color-mix(in srgb, ${accent} 40%, #0a0c0f)`);
  const [ar, ag, ab] = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  root.style.setProperty("--on-accent", 0.2126 * ar + 0.7152 * ag + 0.0722 * ab > 0.18 ? "#140700" : "#ffffff");

  // ---------- panels: disabled blocks are removed (and never polled) ----------
  document.querySelectorAll("[data-panel]").forEach(el => { if (!CFG.panels[el.dataset.panel]) el.remove(); });
  ["left", "right"].forEach(side => { if (!$(side).querySelector(".blk")) document.body.classList.add(`no-${side}`); });

  // ---------- top bar options ----------
  const PLAN = String(CFG.claude_plan || "pro").toLowerCase();
  if (!CFG.topbar.machine_health) $("mac").remove();
  if (!CFG.topbar.claude_usage) $("usage").remove();
  else if (PLAN === "api") {
    $("usage").className = "usage api";
    $("usage").innerHTML = `<span class="ulab">CLAUDE</span><b>API</b>`;
    $("usage").title = "Pay-as-you-go API plan: costs are listed in Settings";
  }
  const USAGE_ON = !!$("u5");
  if (!CFG.topbar.search) $("search-open").remove();

  // ---------- layout: resizable columns, focus, reset ----------
  const DEFAULT = { left: 320, right: 360, focus: false };
  let layout = { ...DEFAULT };
  try { layout = { ...DEFAULT, ...JSON.parse(localStorage.getItem(APP.LAYOUT_KEY) || "{}") }; } catch {}
  const save = () => { try { localStorage.setItem(APP.LAYOUT_KEY, JSON.stringify(layout)); } catch {} };
  function applyLayout() {
    root.style.setProperty("--left", layout.left + "px");
    root.style.setProperty("--right", layout.right + "px");
    document.body.classList.toggle("focus", layout.focus);
    $("focus").setAttribute("aria-pressed", layout.focus);
  }
  applyLayout();
  function drag(el, onMove) {
    el.addEventListener("pointerdown", e => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const move = ev => onMove(ev), up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); save(); };
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
    });
  }
  document.querySelectorAll(".handle").forEach(h => drag(h, ev => {
    const clamp = v => Math.max(240, Math.min(560, v));
    if (h.dataset.side === "left") layout.left = clamp(ev.clientX - 2);
    else layout.right = clamp(window.innerWidth - ev.clientX - 2);
    applyLayout();
  }));
  $("reset-layout").onclick = () => { layout = { ...DEFAULT }; applyLayout(); save(); };
  $("focus").onclick = () => { layout.focus = !layout.focus; applyLayout(); save(); };

  // ---------- Today widgets (order from config.today.widgets) ----------
  const tzOk = tz => { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch { return false; } };
  const CLOCKS = (CFG.clocks || []).filter(c => c && c.tz && tzOk(c.tz)).slice(0, 3);
  (function buildToday() {
    const box = $("today-body");
    if (!box) return;
    let h = "", zone = [], after = "";
    const flush = () => { if (zone.length) h += `<div class="zones">${zone.join("")}</div>${after}`; zone = []; after = ""; };
    const seen = new Set();
    for (const w of CFG.today.widgets) {
      if (seen.has(w)) continue;
      seen.add(w);
      if (w === "clock") {
        flush();
        h += `<div class="clock-row"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="none" stroke="#2a313b" stroke-width="1.5"/>` +
          `<line id="hh" x1="32" y1="32" x2="32" y2="16" stroke="#e8e5de" stroke-width="2.5" stroke-linecap="round"/>` +
          `<line id="mh" x1="32" y1="32" x2="32" y2="9" stroke="#e8e5de" stroke-width="1.5" stroke-linecap="round"/>` +
          `<line id="sh" x1="32" y1="36" x2="32" y2="7" style="stroke:var(--accent)" stroke-width="1"/><circle cx="32" cy="32" r="2" style="fill:var(--accent)"/></svg>` +
          `<div><div class="time" id="time">--:--<small>:--</small></div><div class="lbl" style="margin-top:6px">LOCAL · <span id="utc"></span></div></div></div>`;
      } else if (w === "clocks") {
        CLOCKS.forEach((c, i) => zone.push(`<div><div class="lbl">${esc(c.label || c.tz)}</div><div class="v" data-tz="${i}">--:--</div></div>`));
      } else if (w === "goal") {
        zone.push(`<div class="gate"><div class="lbl">${esc(CFG.today.goal_label || "Next milestone")}</div><div class="v" id="gate">–</div></div>`);
        after += `<div class="lbl" id="gate-label" style="margin-top:8px;text-transform:none;letter-spacing:.02em"></div>`;
      } else if (w === "quarters") {
        flush();
        h += `<div class="qgrid" id="qgrid"></div><div class="qleg"><span><span style="color:var(--accent)">■</span> milestone</span><span><span style="color:var(--accent)">□</span> this week</span><span id="qwin"></span></div>`;
      }
    }
    flush();
    box.innerHTML = h;
  })();

  // ---------- clocks (the only thing updated every second) ----------
  const tzFmt = CLOCKS.map(c => new Intl.DateTimeFormat("en-GB", { timeZone: c.tz, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }));
  function clock() {
    const n = new Date();
    if ($("time")) {
      $("time").innerHTML = `${hhmm(n)}<small>:${pad(n.getSeconds())}</small>`;
      const s = n.getSeconds(), m = n.getMinutes() + s / 60, h = (n.getHours() % 12) + m / 60;
      $("hh").setAttribute("transform", `rotate(${h * 30} 32 32)`);
      $("mh").setAttribute("transform", `rotate(${m * 6} 32 32)`);
      $("sh").setAttribute("transform", `rotate(${s * 6} 32 32)`);
      const off = -n.getTimezoneOffset() / 60;
      $("utc").textContent = `UTC${off >= 0 ? "+" : ""}${off}`;
    }
    document.querySelectorAll("[data-tz]").forEach(el => { el.textContent = tzFmt[+el.dataset.tz].format(n); });
  }
  if ($("time") || CLOCKS.length) { clock(); setInterval(clock, 1000); }

  // ---------- data ----------
  const data = {};
  async function get(name) {
    try {
      const r = await fetch(`/data/${name}.json`, { cache: "no-store" });
      data[name] = r.ok ? await r.json() : null;
    } catch { data[name] = null; }
  }
  const getJSON = async u => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };

  function stamp(name) {
    const d = data[name];
    if (!d || !d.updated_at) return `<span class="stale">unavailable</span>`;
    const t = new Date(d.updated_at), stale = !(ageMin(d.updated_at) <= APP.STALE_MIN[name]);
    return `<span class="${stale ? "stale" : ""}">${ddmm(t)} ${hhmm(t)}${stale ? " · stale" : ""}</span>`;
  }

  function renderTop() {
    const r = data.routines, m = data["memory-map"];
    const late = !r || !(ageMin(r.updated_at) <= APP.RUNNER_LATE_MIN);
    const queued = r ? (r.queue || []).length : 0;
    $("st-runner").className = "dot " + (late ? "warn" : "ok");
    $("st-runner-v").textContent = (r ? (late ? `${Math.round(ageMin(r.updated_at))} MIN` : "NOW") : "OFF") + (queued ? ` · ${queued} QUEUED` : "");
    // memory map: green when consistent, red with the number of problems (details on hover)
    $("st-map").className = "dot " + (m ? (m.ok ? "ok" : "bad") : "");
    $("st-map-v").textContent = m ? (m.ok ? "OK" : `${Math.max(1, (m.lines || []).length - 1)} ISSUE(S)`) : "–";
    $("st-map-box").title = m && !m.ok ? (m.lines || []).join("\n") : "Memory map: paths and sections checked";
    const dg = data.digest;
    $("st-data").textContent = dg && dg.updated_at ? `${ddmm(new Date(dg.updated_at))} ${hhmm(new Date(dg.updated_at))}` : "–";
    document.querySelectorAll('[data-src="digest"]').forEach(el => el.innerHTML = stamp("digest"));
  }

  function renderToday() {
    if (!$("wk")) return;
    const t = data.today, now = new Date();
    $("wk").innerHTML = `W${t && t.week ? esc(t.week) : "–"} · ${WD[now.getDay()]} ${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    if (!t) { if ($("gate")) $("gate").textContent = "–"; return; }
    if ($("gate") && t.gate && t.gate.date) {
      const d = parseDay(t.gate.date);
      $("gate").textContent = `${WD[d.getDay()]} ${ddmm(d)} · D-${t.gate.days_left ?? Math.max(0, Math.round((d - day0(now)) / 864e5))}`;
      $("gate-label").textContent = t.gate.label || "";
    }
    if ($("qgrid") && Array.isArray(t.quarters)) {
      $("qgrid").innerHTML = t.quarters.map((row, q) => `<span class="q">Q${q + 1}</span>` +
        row.map(c => `<i class="${esc(c.state)} ${c.window ? "window" : ""} ${c.milestone ? "milestone" : ""}" title="week of ${esc(c.monday)}"></i>`).join("")).join("");
      if (t.window && t.window.start) $("qwin").innerHTML = `□ 90-day window ${ddmm(parseDay(t.window.start))}–${ddmm(parseDay(t.window.end))}`;
    }
  }

  // ---------- areas ----------
  const AREA_LABEL = window.AREA_LABEL;
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const AREA_MATCH = CFG.areas.filter(a => a && a.id).map(a => [a.id,
    [a.id, a.label].filter(w => w && w.length >= 3).map(w => new RegExp(`(^|[^\\w])${reEsc(w.toLowerCase()).replace(/[-\s]/g, "[- ]?")}([^\\w]|$)`))]);
  function areaOf(x) {
    if (x.area) return x.area;
    const t = `${x.title || ""} ${x.detail || ""} ${x.text || ""}`.toLowerCase();
    const hit = AREA_MATCH.find(([, res]) => res.some(re => re.test(t)));
    return hit ? hit[0] : null;
  }
  const areaTag = a => a ? `<span class="atag" style="--c:${esc(window.AREA_COLOR[a] || "var(--muted)")}">${esc(AREA_LABEL[a] || a)}</span>` : "";

  // ---------- digest items: checkable cards, links, suggestions ----------
  let done = {};
  const asItem = (x, i, list) => typeof x === "string" ? { id: `txt:${list}:${x.slice(0, 60)}`, title: x, action: false } : { ...x, id: x.id || `idx:${list}:${i}:${(x.title || x.text || "").slice(0, 40)}` };
  const safeHosts = new Set([...APP.SAFE_HOSTS, ...(Array.isArray(CFG.dashboard.safe_hosts) ? CFG.dashboard.safe_hosts : [])]);

  function link(l) {
    let u;
    try { u = new URL(l.url); } catch { return ""; }
    if (u.protocol !== "https:") return "";
    const safe = safeHosts.has(u.hostname);
    const short = u.hostname === "mail.google.com" ? "Gmail" : (l.label || "Open").replace(/^Open (the thread |in )?/i, "") || "Open";
    return `<a class="go ${safe ? "" : "unsafe"}" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" title="${esc(l.label || "")} · ${esc(u.href)}">` +
      `<span class="gl">${safe ? "" : "⚠ "}${esc(short)}</span>${ph("arrow-square-out")}${safe ? "" : `<span class="host">${esc(u.hostname)}</span>`}</a>`;
  }

  const MAIL_ON = !!CFG.mail.enabled;
  const FALLBACK_LABEL = CFG.mail.fallback_by_area || {};
  function itemHTML(x, extra = "") {
    const isDone = !!done[x.id];
    const links = (x.links || (x.url ? [{ url: x.url, label: "Open" }] : [])).map(link).join("");
    // One-click mail actions: "actions" field of the digest, or derived from plain-text suggestions
    const thread = MAIL_ON && /^gmail:[0-9a-f]{8,32}$/.test(x.id) ? x.id.slice(6) : null;
    let acts = Array.isArray(x.actions) ? [...x.actions] : [];
    let sugList = x.suggestions || [];
    if (thread && !acts.length) {
      sugList = sugList.filter(t => {
        const m = /label\s*[«"“']\s*([^»"”']+?)\s*[»"”']/i.exec(t);
        if (m) { acts.push({ type: "file", label: m[1] }); return false; }
        if (/^archive/i.test(t)) { acts.push({ type: "archive" }); return false; }
        return true;
      });
    }
    // File = apply the label and move out of the inbox; always offered for a mail when a label is known
    acts = acts.map(a => a.type === "label" ? { ...a, type: "file" } : a);
    const fb = FALLBACK_LABEL[areaOf(x)];
    if (thread && !acts.some(a => a.type === "file") && fb) acts.unshift({ type: "file", label: fb });
    const short = l => String(l || "").split("/").pop().trim() || String(l || "");
    const doBtns = thread ? acts.filter(a => a.type === "archive" || (a.type === "file" && /^[\w À-ÿ'\/.&-]{1,60}$/.test(a.label || ""))).slice(0, 2).map(a =>
      `<button class="do" data-gmail="${esc(thread)}" data-act="${a.type}" data-label="${esc(a.label || "")}" data-item="${esc(x.id)}" title="${a.type === "archive" ? "Move out of the inbox" : "Apply the label “" + esc(a.label) + "” and move out of the inbox"}">` +
      `${ph(a.type === "archive" ? "archive" : "folder")}<span class="gl">${a.type === "archive" ? "Archive" : "File · " + esc(short(a.label))}</span></button>`).join("") : "";
    const sugs = sugList.map(t => `<span class="sug">${ph("sparkle")}${esc(t)}</span>`).join("");
    return `<li class="item ${x.action ? "todo" : "info"} ${isDone ? "done" : ""}">` +
      (x.action ? `<button class="chk" data-done="${esc(x.id)}" aria-pressed="${isDone}" title="${isDone ? "Mark as to do" : "Mark as done"}">${isDone ? ph("check-circle") : ""}</button>`
                : `<button class="chk info-chk" data-done="${esc(x.id)}" aria-pressed="${isDone}" title="${isDone ? "Restore" : "Dismiss: no longer relevant"}">${isDone ? ph("check-circle") : ""}</button>`) +
      `<div class="ib"><div class="it">${x.action ? `<span class="ki">${ph(APP.KIND_ICON[x.kind] || "flag")}</span>` : ""}${esc(x.title || x.text || "")}${areaTag(areaOf(x))}${extra}</div>` +
      (x.detail ? `<div class="id">${esc(x.detail)}</div>` : "") +
      (sugs && !isDone ? `<div class="sugs">${sugs}</div>` : "") +
      ((links || doBtns) && !isDone ? `<div class="acts">${doBtns}${links}</div>` : "") + `</div></li>`;
  }

  // Sorted: to handle first, then FYI; done items are folded at the bottom.
  function itemList(el, items, extra = () => "", emptyText = "Nothing.") {
    const todo = items.filter(x => x.action && !done[x.id]), info = items.filter(x => !x.action && !done[x.id]), fin = items.filter(x => done[x.id]);
    let h = "";
    if (todo.length) h += `<div class="sec">To handle · ${todo.length}</div><ul class="items">${todo.map(x => itemHTML(x, extra(x))).join("")}</ul>`;
    if (info.length) h += `<div class="sec">FYI · ${info.length}</div><ul class="items">${info.map(x => itemHTML(x, extra(x))).join("")}</ul>`;
    if (fin.length) h += `<details class="fin"><summary>Done or dismissed · ${fin.length}</summary><ul class="items">${fin.map(x => itemHTML(x, extra(x))).join("")}</ul></details>`;
    el.innerHTML = h || `<p class="empty">${esc(emptyText)}</p>`;
    return todo.length;
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-done]");
    if (!b) return;
    const id = b.dataset.done, next = !done[id];
    if (next) done[id] = { done_at: new Date().toISOString() }; else delete done[id];
    renderDigest(); renderProjects();  // show immediately, then save
    try {
      const r = await POST("/done", { id, done: next });
      if (!r.ok) throw new Error(r.status);
    } catch {
      if (next) delete done[id]; else done[id] = { done_at: "" };
      renderDigest();
      alert("Could not save: is the dashboard server up to date?");
    }
  });

  // ---------- pages (centre tabs) ----------
  const BUILTIN = { brain: "Brain", projects: "Projects", business: "Business" };
  const PAGE_LIST = [{ id: "brain" }];
  (CFG.pages || []).forEach(p => {
    if (!p || typeof p.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(p.id) || p.id === "brain" || p.id === "settings") return;
    if (PAGE_LIST.some(x => x.id === p.id)) return;
    if (p.kind === "custom" || BUILTIN[p.id]) PAGE_LIST.push(p);
  });
  const PAGE = Object.fromEntries(PAGE_LIST.map(p => [p.id, p]));
  const isCustom = id => PAGE[id] && PAGE[id].kind === "custom";
  $("tabs").innerHTML = PAGE_LIST.map(p => {
    const ic = isCustom(p.id) && p.icon && (window.PH || {})[p.icon] ? ph(p.icon) : "";
    return `<button data-page="${esc(p.id)}" aria-pressed="${p.id === "brain"}">${ic}${esc(p.title || BUILTIN[p.id] || p.id)}</button>`;
  }).join("");
  $("tabs").hidden = PAGE_LIST.length < 2;
  $("custom-pages").innerHTML = PAGE_LIST.filter(p => isCustom(p.id)).map(p => `<div class="biz" id="page-${esc(p.id)}" hidden></div>`).join("");
  const PAGES = [...PAGE_LIST.map(p => p.id), "settings"];
  let current = "brain";

  // ---------- Projects: milestone, progress, open tasks (from tracking files), mail count ----------
  // area logos are served from /vendor/logos/<name>.png (config may give the file name or that URL)
  const logoUrl = l => typeof l !== "string" ? null : /^\/vendor\/logos\/[\w.-]+\.png$/.test(l) ? l : /^[\w.-]+\.png$/.test(l) ? `/vendor/logos/${l}` : /^[\w-]+$/.test(l) ? `/vendor/logos/${l}.png` : null;
  const AREA_BY_ID = Object.fromEntries(CFG.areas.filter(a => a && a.id).map(a => [a.id, a]));
  function renderProjects() {
    if (!PAGE.projects) return;
    const t = data.today, d = data.digest || {};
    $("proj-ts").innerHTML = stamp("today");
    if (!t || !Array.isArray(t.projects) || !t.projects.length) { $("projects").innerHTML = `<p class="empty">No projects yet: they come from data/today.json (built from your areas).</p>`; return; }
    const mails = {};
    ["overnight", "waiting", "overdue", "live"].forEach(k => (k === "live" ? (data["inbox-live"] || {}).items || [] : d[k] || []).forEach((x, i) => {
      if (typeof x !== "object" || !x || x.action === false) return;
      const it = asItem({ action: true, ...x }, i, { overnight: "ov", waiting: "wt", overdue: "od", live: "lv" }[k]);
      const a = areaOf(it);
      if (a && !done[it.id]) mails[a] = (mails[a] || 0) + 1;
    }));
    const now0 = day0(new Date());
    $("projects").innerHTML = t.projects.map(p => {
      const msl = Array.isArray(p.milestones) ? p.milestones : [];
      const m = msl.find(x => x.date) || msl[0];
      const short = l => (String(l).split(/\s?:\s/)[1] || String(l)).replace(/\s*\(.*\)\s*/g, "");
      const ms = m ? (m.date ? `${esc(short(m.label))} · ${ddmm(parseDay(m.date))} · D-${Math.max(0, Math.round((parseDay(m.date) - now0) / 864e5))}`
                             : esc(short(m.label))) : "";
      const logoSrc = logoUrl((AREA_BY_ID[p.area] || {}).logo || p.logo);
      const logo = logoSrc ? `<img class="logo" src="${esc(logoSrc)}" alt="">` : `<span class="logo ic">${ph("buildings")}</span>`;
      const head = `<div class="ph-row">${logo}<span class="pn">${esc(p.label)}</span>${mails[p.area] ? `<span class="mail-chip">${mails[p.area]} mail${mails[p.area] > 1 ? "s" : ""}</span>` : ""}` +
        (ms ? `<span class="ms ${m && m.date ? "" : "later"}" title="${esc(m.label)}">${ms}</span>` : "") + `</div>`;
      const li = x => `<li class="${x.paused ? "paused" : ""}">${esc(x.text)}${x.paused ? `<span class="tag">paused</span>` : ""}</li>`;
      const list = (arr, n = 4) => arr.length ? `<ul class="ptasks">${arr.slice(0, n).map(li).join("")}` +
        (arr.length > n ? `<li style="display:block"><details><summary>+ ${arr.length - n} more</summary><ul class="ptasks">${arr.slice(n).map(li).join("")}</ul></details></li>` : "") + `</ul>` : "";
      // Session journal: where you left off, kept up to date automatically
      const j = p.journal;
      const ago = j && j.when ? (() => { const h = (Date.now() - new Date(String(j.when).replace(" ", "T"))) / 3.6e6; return h < 1 ? "less than 1 h ago" : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`; })() : "";
      const jopen = (j && j.open) || [];
      const jour = j ? `<div class="jl"><div class="lbl">Last session · ${esc(ago)}</div><p class="js">${esc(j.summary)}</p>` +
        (j.stopped_at ? `<p class="jstop">${ph("flag")}<span><b>Stopped at:</b> ${esc(j.stopped_at)}</span></p>` : "") + `</div>` +
        (jopen.length ? `<div class="sub-lbl">Open tasks · ${jopen.length}</div>${list(jopen.map(t => ({ text: t })), 99)}` : "") +
        ((j.done || []).length ? `<details class="steps"><summary><span class="sub-lbl">Recently done · ${j.done.length}</span></summary><ul class="ptasks">${j.done.map(t => `<li class="done">${esc(t)}</li>`).join("")}</ul></details>` : "") +
        ((j.history || []).length > 1 ? `<details class="steps"><summary><span class="sub-lbl">Earlier sessions · ${j.history.length - 1}</span></summary><ul class="hist">${j.history.slice(1).map(h => `<li><span>${esc(String(h.when || "").slice(5, 10).split("-").reverse().join("."))}</span><span>${esc(h.summary)}</span></li>`).join("")}</ul></details>` : "") : "";
      // Steps from the tracking file (PROGRESS.md…): folded so they don't mix with the rest
      const prog = p.total ? `<details class="steps"><summary><span class="sub-lbl">Steps · ${p.done}/${p.total}</span><div class="qbar"><span style="width:${(p.done / p.total) * 100}%"></span></div></summary>${list(p.tasks || [], 99)}</details>` : "";
      const sources = Array.isArray(p.sources) ? p.sources : [];
      const links = sources.map(s => s.url ? link({ url: s.url, label: s.label })
        : `<a class="go" href="/file?id=${encodeURIComponent(s.path)}" target="_blank" rel="noopener" title="${esc(homeTilde(s.path))}"><span class="gl">${esc(s.label)}</span>${ph("arrow-square-out")}</a>`).join("");
      const none = !p.total && !j ? `<div class="pnone">${sources.some(s => s.url) ? "Tasks are tracked in an external tool." : "No task list yet: add a tracking file (e.g. PROGRESS.md) to the State section of this area."}</div>` : "";
      return `<div class="proj" style="--c:${esc(window.AREA_COLOR[p.area] || "var(--muted)")}">${head}${jour}${prog}${none}${links ? `<div class="acts">${links}</div>` : ""}</div>`;
    }).join("");
  }

  function renderDigest() {
    const d = data.digest || {}, t = data.today, today = day0(new Date());
    if ($("next14")) {
      const horizon = new Date(today); horizon.setDate(horizon.getDate() + APP.DAYS_AHEAD);
      const items = [];
      (t?.milestones || []).forEach(m => { if (m.date) items.push({ date: m.date, text: m.label, tag: "milestone" }); });
      const nd = Array.isArray(d.next_days) ? d.next_days : Array.isArray(d.next_14_days) ? d.next_14_days : [];
      nd.forEach(x => x && x.date && items.push(x));
      const shown = items.map(x => ({ ...x, d: parseDay(x.date) })).filter(x => x.d >= today && x.d <= horizon).sort((a, b) => a.d - b.d);
      const textOrLink = x => { let u = null; try { u = x.url && new URL(x.url); } catch {} return u && u.protocol === "https:" ? `<a class="inl" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(x.text)}</a>` : esc(x.text); };
      $("next14").innerHTML = shown.length ? shown.map(x => `<span class="d ${+x.d === +today ? "today" : ""}">${WD[x.d.getDay()]} ${ddmm(x.d)}</span>` +
        `<span class="t ${x.tag === "milestone" || x.tag === "gate" ? "gate" : ""}">${textOrLink(x)}<span class="tag">${esc(x.tag || "")}</span></span>`).join("")
        : `<span></span><span class="empty">Nothing in the next 14 days (the next digest will fill this list).</span>`;
    }

    // INBOX: a single list. Overdue (digest), then new (checked during the day), then overnight (digest).
    // Each card keeps a source tag; a thread appears only once (the most urgent source wins).
    const live = data["inbox-live"] || {};
    const waitingIds = new Set((d.waiting || []).map(x => x && x.id));
    if ($("mailbox")) {
      const od = (Array.isArray(d.overdue) ? d.overdue : []).map((x, i) => ({ ...asItem(typeof x === "string" ? x : { action: true, ...x, title: x.title || x.text }, i, "od"), _src: "late" }));
      const li = (live.items || []).filter(x => !x.waiting && !waitingIds.has(x.id)).map((x, i) => ({ ...asItem(x, i, "lv"), _src: "new" }));
      const ov = (d.overnight || []).map((x, i) => ({ ...asItem(x, i, "ov"), _src: "night" }));
      const seenIds = new Set(), box = [];
      [...od, ...li, ...ov].forEach(x => { if (!seenIds.has(x.id)) { seenIds.add(x.id); box.push(x); } });
      const SRC = { late: "overdue", new: "new", night: "overnight" };
      badge("inbox-todo-n", itemList($("mailbox"), box, x => `<span class="src ${x._src}">${SRC[x._src]}${x._src === "new" && x.received_at ? " " + hhmm(new Date(x.received_at)) : ""}${x._src === "late" && x.since ? " since " + esc(String(x.since).slice(8, 10) + "." + String(x.since).slice(5, 7)) : ""}</span>`,
        "Nothing to handle: inbox is clear."));
      $("live-ts").textContent = live.checked_at ? `checked ${hhmm(new Date(live.checked_at))}` : "not checked yet";
      // Digest summary: can be closed, stays closed until the next digest (remembered in this browser)
      let closed = null;
      try { closed = localStorage.getItem("aos-summary-closed"); } catch {}
      $("summary").innerHTML = esc(d.summary || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      $("summary-box").hidden = !d.summary || closed === d.updated_at;
    }

    // Who is waiting on you (accepts the plain-text format too)
    if ($("waiting")) {
      const w = (d.waiting || []).map((x, i) => asItem(typeof x === "string" ? { who: x, title: x, action: true } : { action: true, ...x, title: x.title || x.who }, i, "wt"));
      // + today's new mails that wait for a reply
      const wIds = new Set(w.map(x => x.id));
      (live.items || []).filter(x => x.waiting && !wIds.has(x.id)).forEach((x, i) => w.push(asItem({ action: true, ...x, title: x.title || x.who }, i, "lv")));
      badge("wait-n", w.filter(x => !done[x.id]).length);
      itemList($("waiting"), w, x => `${x.temp ? `<span class="tag ${x.temp === "hot" ? "hot" : ""}">${esc(x.temp)}</span>` : ""}${x.days != null ? `<span class="tag">${esc(x.days)} d</span>` : ""}`, "Nobody is waiting for a reply.");
    }
  }

  function badge(id, n, cls = "") {
    const el = $(id);
    if (!el) return;
    el.textContent = n;
    el.className = "cnt " + (cls || (n ? "" : "zero"));
  }

  // "30 7 * * *" -> "daily at 07:30"
  function humanCron(expr) {
    if (!expr) return "on demand";
    const [mi, h, dom, mon, dow] = expr.split(" ");
    const at = /^\d+$/.test(mi) && /^\d+$/.test(h) ? `${pad(h)}:${pad(mi)}` : null;
    if (/^\*\/\d+$/.test(mi) && h === "*") return `every ${mi.slice(2)} min`;
    if (at && dom === "*" && mon === "*") {
      if (dow === "*") return `daily at ${at}`;
      if (dow === "1-5") return `weekdays at ${at}`;
      if (/^\d$/.test(dow)) return `${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][+dow]} at ${at}`;
    }
    return expr;
  }

  function renderRoutines() {
    const r = data.routines;
    if ($("deck")) {
      const deck = r ? (r.routines || []).filter(x => !x.internal && x.deck !== false) : [];
      $("deck").innerHTML = deck.length ? deck.map(x => `<button class="tile" data-run="${esc(x.name)}" ${x.enabled === false ? "disabled" : ""} title="Run /${esc(x.name)} now">` +
        `<span class="ic">${ph("play")}</span><span style="min-width:0"><span class="tn">${esc(x.label || "/" + x.name)}</span><span class="tsub">${esc(humanCron(x.schedule))}</span></span></button>`).join("")
        : `<p class="empty">${r ? "No routine in the deck yet." : "The runner is not responding."}</p>`;
    }
    if (!$("routines")) return;
    if (!r) { $("routines").innerHTML = `<li class="empty">The runner is not responding.</li>`; $("rsum").innerHTML = ""; return; }
    const queued = new Set(r.queue || []);
    const today = new Date().toISOString().slice(0, 10);
    const list = [...(r.routines || [])].filter(x => x.schedule || (x.last && String(x.last.time).startsWith(today)) || queued.has(x.name));
    // NEXT: the closest one among those that have not run yet today
    const nextOne = list.filter(x => x.next_run && !x.fired_today && !queued.has(x.name)).sort((a, b) => a.next_run.localeCompare(b.next_run))[0];
    badge("fired-n", `${r.fired_today ?? 0}/${r.scheduled_today ?? 0}`, (r.fired_today ?? 0) >= (r.scheduled_today ?? 0) ? "ok" : "");
    $("fired").innerHTML = stamp("routines");
    const when = x => {
      const t = x.fired_today && x.last ? new Date(x.last.time) : x.next_run ? new Date(x.next_run) : null;
      return t ? hhmm(t) : "–";
    };
    list.sort((a, b) => when(a).localeCompare(when(b)));
    $("routines").innerHTML = list.length ? list.map(x => {
      const st = x.enabled === false ? ["off", "OFF"] : queued.has(x.name) ? ["queued", "QUEUED"]
        : x.fired_today ? ["fired", "DONE"] : x.last && x.last.status !== "ok" && String(x.last.time).startsWith(today) ? ["err", String(x.last.status).toUpperCase()]
        : x === nextOne ? ["next", "NEXT"] : ["off", "PLANNED"];
      const meta = [humanCron(x.schedule), x.last && x.last.duration ? `${x.last.duration} s` : "", x.llm ? "AI" : "no AI"].filter(Boolean).join(" · ");
      return `<li class="rrow ${x === nextOne ? "is-next" : ""}"><span class="tm">${when(x)}</span>` +
        `<span><span class="rn">${esc(x.name)}</span><span class="rs">${esc(meta)}</span></span><span class="stp ${st[0]}">${esc(st[1])}</span></li>`;
    }).join("") : `<li class="empty">No scheduled routine.</li>`;

    // Caps: bars turn orange then red near the limit
    const c = r.caps || {};
    const q = (label, n, of) => {
      const pct = Math.min(100, ((n || 0) / Math.max(1, of || 0)) * 100);
      return `<div class="qrow"><span>${label}</span><div class="qbar ${pct >= 100 ? "full" : pct >= 75 ? "warn" : ""}"><span style="width:${pct}%"></span></div><span class="n">${n ?? 0}/${of ?? "–"}</span></div>`;
    };
    const line = (k, x) => x ? `<span>${k} · <b>${x.ok ?? 0} OK</b> · ${x.errors ? `<b style="color:var(--bad)">${x.errors} error(s)</b>` : "0 errors"} · ${money(x.cost)}</span>` : "";
    const wm = c.window_minutes || 60;
    $("rsum").innerHTML = q("daily cap", c.runs_today, c.daily_runs) + q(wm % 60 ? `${wm} min cap` : `${wm / 60} h cap`, c.runs_in_window, c.window_runs) +
      `<div class="stats">${line("Today", r.today)}${line("Yesterday", r.yesterday)}</div>`;
  }

  // ▶: drops a request in the queue; the runner executes it on its next pass
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-run]");
    if (!b) return;
    const msg = $("deck-msg"), name = b.dataset.run;
    try {
      const r = await POST(`/run/${encodeURIComponent(name)}`, undefined, false);
      const d = await r.json().catch(() => ({}));
      msg.textContent = r.ok ? (d.queued ? `/${name} queued · runs on the next pass (≤ 5 min)` : `/${name}: ${d.reason || "already queued"}`) : `/${name} refused (HTTP ${r.status})`;
    } catch { msg.textContent = "network error"; }
  });

  // Local server: green = up to date, orange = server code changed (restart), red = unreachable
  async function health() {
    const dot = $("st-server-dot"), v = $("st-server-v"), box = $("st-server");
    try {
      const r = await fetch("/health", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const h = await r.json(), up = ageMin(h.started_at);
      const upTxt = up < 60 ? `${Math.round(up)} MIN` : up < 2880 ? `${Math.round(up / 60)} H` : `${Math.round(up / 1440)} D`;
      dot.className = "dot " + (h.restart_needed ? "warn" : "ok");
      v.textContent = h.restart_needed ? "" : `UP ${upTxt}`;
      $("st-restart").hidden = !h.restart_needed;
      health.started = h.started_at;
      box.title = h.restart_needed ? "The server code changed since launch: restart it" : `Started ${new Date(h.started_at).toLocaleString()}`;
    } catch (e) {
      const old = String(e.message) === "404";
      dot.className = "dot " + (old ? "warn" : "bad");
      v.textContent = old ? "RESTART (manually)" : "OFF";
      $("st-restart").hidden = true;
      box.title = old ? "Server older than this indicator: stop it and start it again" : "Server unreachable: start dashboard/server.py again";
    }
  }
  health(); setInterval(health, 15000);

  // ↻ restart: the server restarts itself; wait for the new one, then reload the page
  $("st-restart").onclick = async () => {
    const b = $("st-restart"), before = health.started;
    b.disabled = true; b.textContent = "restarting…";
    try {
      const r = await POST("/restart", undefined, false);
      if (!r.ok) throw new Error(r.status === 404 ? "server too old: restart it manually one last time" : r.status);
    } catch (e) { b.disabled = false; b.textContent = "↻ restart"; return alert(e.message); }
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      try { const h = await (await fetch("/health", { cache: "no-store" })).json(); if (h.started_at !== before) return location.reload(); } catch {}
    }
    b.disabled = false; b.textContent = "↻ restart"; alert("The server no longer responds: start it again in the terminal.");
  };

  if ($("summary-close")) $("summary-close").onclick = () => {
    try { localStorage.setItem("aos-summary-closed", (data.digest || {}).updated_at || ""); } catch {}
    $("summary-box").hidden = true;
  };

  // ↻ in the Inbox block: check mail now
  if ($("live-check")) {
    const every = (CFG.mail.watch || {}).interval_min;
    $("live-check").title = `Check mail now${every ? ` (otherwise every ${every} min)` : ""}`;
    $("live-check").onclick = async () => {
      $("live-ts").textContent = "checking…";
      try { await POST("/run/mail-check", undefined, false); } catch {}
      setTimeout(refresh, 25000); setTimeout(refresh, 60000);
    };
  }

  // ---------- mail actions (file / archive), behind a user click ----------
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-gmail]");
    if (!b || !MAIL_ON) return;
    const params = { thread: b.dataset.gmail, action: b.dataset.act, label: b.dataset.label || "" };
    b.disabled = true;
    const lbl = b.querySelector(".gl"), before = lbl.textContent;
    lbl.textContent = "Working…";
    try {
      const r = await POST("/run/gmail-apply", { params });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.reason || r.status);
      lbl.textContent = d.queued ? "Sent ✓" : "Already queued";
      if (params.action === "archive" || params.action === "file") {  // filed or archived = handled
        await POST("/done", { id: b.dataset.item, done: true });
        done[b.dataset.item] = { done_at: new Date().toISOString() };
        setTimeout(() => { renderDigest(); renderProjects(); }, 1200);
      }
    } catch (err) { lbl.textContent = before; b.disabled = false; alert(`Action refused: ${err.message}`); }
  });

  // ---------- quick capture + filing suggested by the AI ----------
  let inbox = [];
  async function loadInbox() {
    if (!$("inbox")) return;
    try { const r = await fetch("/state/inbox.json", { cache: "no-store" }); if (r.ok) inbox = (await r.json()).notes || []; } catch {}
    renderInbox();
    clearTimeout(loadInbox.t);
    const busy = inbox.some(n => n.status === "new" || n.pending);
    loadInbox.t = setTimeout(loadInbox, busy ? 4000 : 60000);
  }
  function renderInbox() {
    if (!$("inbox")) return;
    const open = inbox.filter(n => n.status === "new" || n.status === "triaged" || n.status === "manual");
    badge("inbox-n", open.length);
    const recent = inbox.filter(n => n.status === "applied").slice(0, 5);
    $("inbox").innerHTML = open.map(n => {
      const t = n.triage || {};
      if (n.status === "new") return `<div class="note"><div class="nt"><span class="spin"></span>Analysing…</div><div class="nq">“${esc(String(n.text || "").slice(0, 160))}”</div></div>`;
      if (n.status === "manual") {
        const o = (t.options || [])[n.applied?.choice || 0] || {};
        return `<div class="note"><div class="nt">${esc(t.title || n.text)}${areaTag(t.area)}</div><p class="why">For you to do: ${esc(o.label || "")} ${o.why ? "· " + esc(o.why) : ""}</p>` +
          `<div class="nfoot"><span></span><button class="lnk" data-inbox="${esc(n.id)}" data-do="dismiss">done · remove</button></div></div>`;
      }
      const opts = (t.options || []).map((o, i) => `<div class="opt ${i ? "alt" : ""}"><button class="go" data-inbox="${esc(n.id)}" data-do="apply" data-choice="${i}" title="${esc(o.line || "")}">` +
        `<span class="gl">${esc(o.label || o.type)}</span></button><span class="why">${esc(o.why || "")}</span></div>`).join("");
      return `<div class="note"><div class="nt">${esc(t.title || n.text)}${areaTag(t.area)}<span class="tag">${esc(t.kind || "")}</span></div>` +
        `<div class="nq">“${esc(String(n.text || "").slice(0, 200))}”</div><div class="opts">${opts}</div>` +
        `<div class="nfoot"><span></span><button class="lnk" data-inbox="${esc(n.id)}" data-do="dismiss">ignore</button></div></div>`;
    }).join("") + (recent.length ? `<details class="fin"><summary>Recently filed · ${recent.length}</summary><ul class="items">${recent.map(n =>
      `<li class="item info"><span class="dotk">${ph("check-circle")}</span><div class="ib"><div class="it">${esc((n.triage || {}).title || n.text)}${areaTag((n.triage || {}).area)}</div>` +
      `<div class="id">→ ${esc(homeTilde(n.applied?.target))}</div></div></li>`).join("")}</ul></details>` : "");
  }
  async function sendCapture() {
    const t = $("cap-text").value.trim();
    if (!t) return;
    $("cap-send").disabled = true;
    try {
      const r = await POST("/capture", { text: t });
      if (!r.ok) throw new Error(r.status === 404 ? "restart the server" : r.status);
      $("cap-text").value = ""; $("cap-msg").textContent = "Captured ✓ · analysing";
      setTimeout(() => $("cap-msg").textContent = "", 4000);
      loadInbox();
    } catch (err) { $("cap-msg").textContent = `Failed: ${err.message}`; }
    $("cap-send").disabled = false;
  }
  if ($("cap-send")) {
    $("cap-send").onclick = sendCapture;
    $("cap-text").addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendCapture(); } });
  }
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-inbox]");
    if (!b) return;
    b.disabled = true;
    const body = b.dataset.do === "apply" ? { choice: +b.dataset.choice } : {};
    const n = inbox.find(x => x.id === b.dataset.inbox);
    if (n && b.dataset.do === "apply") n.pending = true;
    try {
      const r = await POST(`/inbox/${b.dataset.inbox}/${b.dataset.do}`, body);
      if (!r.ok) throw new Error(r.status);
      if (b.dataset.do === "apply") b.querySelector(".gl").textContent = "Filing…";
    } catch (err) { b.disabled = false; alert(`Failed: ${err.message}`); }
    setTimeout(loadInbox, 1500);
  });
  loadInbox();

  // ---------- page switching ----------
  // The page shown is kept in the URL (#business), so it survives a reload and can be linked.
  function showPage(page) {
    page = PAGES.includes(page) ? page : "brain";
    current = page;
    document.querySelectorAll("[data-page]").forEach(x => x.setAttribute("aria-pressed", x.dataset.page === page));
    document.body.classList.toggle("page-other", page !== "brain");
    $("biz").hidden = page !== "business";
    $("projpage").hidden = page !== "projects";
    $("settings").hidden = page !== "settings";
    PAGE_LIST.filter(p => isCustom(p.id)).forEach(p => { $(`page-${p.id}`).hidden = page !== p.id; });
    $("open-settings").setAttribute("aria-pressed", page === "settings");
    if (page === "settings") renderSettings();
    if (page === "business") renderBusiness();
    if (page === "projects") renderProjects();
    if (isCustom(page)) renderCustom(PAGE[page]);
    const hash = page === "brain" ? "" : `#${page}`;
    if (location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
  }
  $("tabs").addEventListener("click", e => { const b = e.target.closest("[data-page]"); if (b) showPage(b.dataset.page); });
  window.addEventListener("hashchange", () => showPage(location.hash.slice(1)));
  $("open-settings").onclick = () => showPage(current === "settings" ? "brain" : "settings");

  // ---------- Settings: all automatic activity, its frequency and its cost ----------
  const PLAN_NAME = { pro: "Pro", max5: "Max 5x", max20: "Max 20x", team: "Team", enterprise: "Enterprise", api: "API" };
  const GROUP_TITLE = { "Scheduled": "Scheduled routines", "Continuous": "Recurring tasks", "Event": "Triggered by an event",
    "On demand": "On demand (dashboard buttons)", "Dashboard": "Dashboard refreshes (free)" };
  async function renderSettings() {
    const o = await getJSON("/ops");
    if (!o) { $("settings").innerHTML = `<p class="empty">Inventory unavailable: restart the server (↻ restart).</p>`; return; }
    const t = o.totals || {}, items = Array.isArray(o.items) ? o.items : [];
    const both = v => money(v, v >= 100 ? 0 : 2);
    const pw = o.plan && o.plan.seven_day, p5 = o.plan && o.plan.five_hour;
    const fx = CUR.code === "USD" ? "" : ` Amounts converted from USD API prices (1 USD = ${CUR.rate} ${esc(CUR.code)}).`;
    let h = "";
    if (PLAN !== "api" && pw && pw.capacity_usd) {
      const osWeek = (t.est_day || 0) * 7, share = osWeek / pw.capacity_usd * 100;
      const sub = o.subscription && (o.subscription.local);
      h += `<div class="subcmp"><div><span class="k">Your ${esc(PLAN_NAME[PLAN] || PLAN)} plan is worth ≈</span><b>${both(pw.capacity_usd)} / week</b>` +
        `<span class="s">of tokens at API prices · ≈ ${money(pw.capacity_usd * 30 / 7, 0)} / month${p5 && p5.capacity_usd ? ` · ≈ ${money(p5.capacity_usd, 0)} per 5-hour window` : ""}</span></div>` +
        `<p><b>How it is computed:</b> since the start of your weekly quota window (${pw.window_start ? ddmm(new Date(pw.window_start)) : "–"}), all your Claude Code sessions (you + the OS) used <b>${money(pw.spent_usd)}</b> of tokens at API prices, ` +
        `which is <b>${Math.round(pw.used_pct || 0)}%</b> of your weekly quota. ` +
        `The OS uses ≈ <b>${money(osWeek)} per week</b>, i.e. <b>≈ ${share < 1 ? share.toFixed(1) : Math.round(share)}% of your quota</b>. ` +
        `<span class="s">Estimate: it gets more precise as the week goes on. Usage on claude.ai (outside Claude Code) counts towards the quota but not in this computation, so the real value may be a bit higher.${sub != null ? ` You pay ${esc(fmtCur(sub, CUR.code, 0))} / month.` : ""}${fx}</span></p></div>`;
    }
    const pct = v => PLAN !== "api" && pw && pw.capacity_usd ? ` · ${(v / pw.capacity_usd * 100).toFixed(1)}% of weekly quota` : "";
    h += `<div class="ops-tot"><div><span class="k">The OS · per day</span><b>${both(t.est_day)}</b><span class="s">API prices${pct((t.est_day || 0) * 7)}</span></div>` +
      `<div><span class="k">The OS · 30 days</span><b>${both(t.est_month)}</b><span class="s">API price equivalent</span></div>` +
      `<div><span class="k">Measured · last ${esc(o.window_days ?? 7)} days</span><b>${money(t.actual_7d)}</b><span class="s">tests included</span></div>` +
      (o.caps ? `<div><span class="k">Routine caps</span><b>${esc(o.caps.daily_runs)}/d · ${esc(o.caps.window_runs)}/h</b><span class="s">runaway protection</span></div>` : "") + `</div>`;
    const groups = [...Object.keys(GROUP_TITLE), ...new Set(items.map(i => i.group))].filter((g, i, a) => a.indexOf(g) === i);
    for (const g of groups) {
      const rows = items.filter(i => i.group === g).sort((a, b) => (b.est_day || 0) - (a.est_day || 0));
      if (!rows.length) continue;
      const sub = rows.reduce((a, i) => a + (i.est_day || 0), 0);
      h += `<section class="blk"><div class="bh"><span class="bt">${esc(GROUP_TITLE[g] || g)}</span><span class="ts">${sub ? "≈ " + money(sub) + " / day" : "free"}</span></div><div class="ops">` +
        rows.map(i => {
          const free = !i.est_day && !i.avg_cost && /^(no AI|-)$/i.test(String(i.model || ""));
          const meta = [`${ph("clock")}${esc(i.when)}`, esc(i.model),
            i.per_day ? `${esc(i.per_day)} × / day` : "", i.avg_cost ? `${money(i.avg_cost)} / run` : "",
            i.last ? `last ${ddmm(new Date(i.last))} ${hhmm(new Date(i.last))}` : ""].filter(Boolean);
          return `<div class="op ${i.enabled ? "" : "off"}"><div class="op-h"><span class="nm">${esc(i.name)}</span>` +
            `<span class="op-cost ${i.est_day >= 1 ? "heavy" : ""}">${free ? "free" : !i.est_day && !i.avg_cost ? "no runs yet" : `<b>${money(i.est_day)}</b>/d · ${money(i.est_month)}/month`}</span></div>` +
            `<div class="op-meta">${meta.map(m => `<span>${m}</span>`).join("")}</div>` +
            `<p class="op-what">${esc(i.what)}${i.note ? ` <i>${esc(i.note)}</i>` : ""}</p></div>`;
        }).join("") + `</div></section>`;
    }
    h += `<p class="ops-note"><b>How to read these costs.</b> They are amounts at public API prices (in USD${CUR.code === "USD" ? "" : `, converted to ${esc(CUR.code)} at ${CUR.rate}`}), computed by Claude Code for each session. ` +
      (PLAN === "api" ? `On the API plan they are <b>billed</b> to your account.` : `On a Claude subscription they are not billed: they consume your <b>quota</b> (CLAUDE gauge at the top).`) +
      ` Frequencies of event-triggered tasks are observed over the last ${esc(o.window_days ?? 7)} days. To change a rhythm, ask the chat ("/" then Tab), e.g. "check mail every 30 min".</p>`;
    $("settings").innerHTML = h;
  }

  // ---------- machine health: green / orange / red from the thresholds in macstats.py ----------
  async function machine() {
    const s = await getJSON("/sys");
    if (!s) { $("mac").innerHTML = `<span class="mlab">SYS</span><span class="mi"><i></i><b>–</b></span>`; return; }
    const LV = { ok: "normal", warn: "watch", bad: "critical", na: "unavailable" };
    const item = (k, v, lv, tip) => `<span class="mi ${esc(lv)}" title="${esc(tip)}"><i></i><span class="k">${k}</span><b>${esc(v)}</b></span>`;
    const t = s.temp || {}, m = s.ram || {}, c = s.cpu || {}, d = s.disk || {}, b = s.battery, th = s.throttling || {};
    const ORDER = ["na", "ok", "warn", "bad"];
    const worse = (...l) => l.filter(Boolean).reduce((a, x) => ORDER.indexOf(x) > ORDER.indexOf(a) ? x : a, "ok");
    let h = `<span class="mlab">SYS</span>`;
    if (s.temp) h += item("TEMP", t.chip != null ? `${Math.round(t.chip)}°` : "–", worse(t.level, t.ssd_level, t.battery_level),
      `Chip: ${t.chip ?? "–"} °C (avg ${t.chip_avg ?? "–"} °C) · SSD: ${t.ssd ?? "–"} °C · battery: ${t.battery ?? "–"} °C\nThermal throttling: ${th.cpu_speed_limit != null && th.cpu_speed_limit < 100 ? "yes, speed " + th.cpu_speed_limit + "%" : "no"}\nState: ${LV[t.level] || "–"} (orange from 80 °C, red from 95 °C)`);
    if (s.ram) h += item("RAM", `${m.used_pct}%`, worse(m.level, m.swap_level),
      `Memory: ${m.used_pct}% of ${m.total_gb} GB · pressure: ${m.pressure === "normal" ? "normal" : m.pressure === "warn" ? "high" : m.pressure ? "critical" : "–"}\nSwap: ${m.swap_gb ?? "–"} GB${m.swap_gb >= 4 ? " (the disk is used as memory: things slow down)" : ""}`);
    if (s.cpu) h += item("CPU", `${c.load_pct}%`, c.level, `1-minute load average: ${c.load_pct}% of ${c.cores} cores`);
    if (s.disk) h += item("SSD", `${d.free_pct}% free`, d.level, `Disk: ${d.free_gb} GB free of ${d.total_gb} GB${d.level !== "ok" ? "\nThe system slows down and may fail updates below ~10% free" : ""}`);
    if (b) h += item(b.on_ac ? "⚡" : "BATT", `${b.pct}%`, b.level, `Battery: ${b.pct}% · ${b.state || ""}${b.remaining && b.remaining !== "0:00" && !String(b.remaining).includes("no") ? " · " + b.remaining + " left" : ""}`);
    $("mac").innerHTML = h;
  }
  if ($("mac")) { machine(); setInterval(machine, 15000); }

  // ---------- Claude subscription usage (read by the Claude Code status line) ----------
  async function usage() {
    const u = await getJSON("/state/usage.json");
    const box = $("usage"), now = Date.now() / 1000;
    const one = (w, id) => {
      const val = $(id), bar = $(id + "b"), rst = $(id + "r");
      if (!w || w.used_percentage == null) { val.textContent = "–"; bar.style.width = "0"; rst.textContent = ""; return; }
      const reset = w.resets_at && w.resets_at <= now;  // window elapsed since the reading: quota is full again
      const left = reset ? 100 : Math.max(0, Math.round(100 - w.used_percentage));
      val.textContent = `${left}%`;
      bar.style.width = `${left}%`;
      bar.className = left <= 10 ? "bad" : left <= 25 ? "warn" : "";
      const d = new Date(w.resets_at * 1000);
      rst.textContent = reset ? "reset" : w.resets_at ? `↻ ${d.toDateString() === new Date().toDateString() ? hhmm(d) : WD[d.getDay()] + " " + hhmm(d)}` : "";
    };
    one(u && u.five_hour, "u5"); one(u && u.seven_day, "u7");
    const age = u ? ageMin(u.updated_at) : null;
    box.classList.toggle("stale", !u || age > 30);
    box.title = u ? `Left on your Claude subscription. Read ${age < 1 ? "just now" : `${Math.round(age)} min ago`} (${u.source || "?"}). Click to refresh now.`
                  : "No reading yet. Click to refresh now.";
  }
  if (USAGE_ON) {
    usage(); setInterval(usage, 30000);
    // click on the gauge: refresh now (light probe through the queue)
    $("usage").addEventListener("click", async () => {
      $("usage").classList.add("stale");
      try { await POST("/run/usage-refresh", undefined, false); } catch {}
      setTimeout(usage, 8000); setTimeout(usage, 20000);
    });
  } else if ($("usage")) $("usage").addEventListener("click", () => showPage("settings"));

  // ---------- "/" palette: projects, files, folders, images, documents ----------
  const SEARCH_ON = !!CFG.topbar.search;
  const SX_ICON = { folder: "folder", image: "image", pdf: "file-pdf", doc: "file-text", code: "terminal", video: "file-video", file: "file-text", brain: "brain" };
  let sxItems = [], sxSel = 0, sxSeq = 0, brainNodes = null;
  let sxMode = "search";
  const sxOpen = () => { $("sx").hidden = false; $("sx-q").value = ""; $("sx-q").focus(); setMode(sxMode); };
  const sxClose = () => { $("sx").hidden = true; };
  if ($("search-open")) $("search-open").onclick = sxOpen;
  $("sx").addEventListener("click", e => { if (e.target.id === "sx") sxClose(); });
  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (e.key === "/" && SEARCH_ON && !typing && $("sx").hidden) { e.preventDefault(); sxOpen(); return; }
    if ($("sx").hidden) return;
    if (e.key === "Escape") { e.preventDefault(); sxClose(); return; }
    if (e.key === "Tab") { e.preventDefault(); setMode(sxMode === "chat" ? "search" : "chat"); return; }
    if (sxMode === "chat") {
      if (e.key === "Enter" && !e.shiftKey && document.activeElement === $("sx-q")) { e.preventDefault(); chatSend($("sx-q").value); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sxTouched = true; sxSel = Math.max(-1, Math.min(sxItems.length - 1, sxSel + (e.key === "ArrowDown" ? 1 : -1))); sxMark(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const q = $("sx-q").value.trim();
      if (q.length >= 2 && (sxSel < 0 || !sxItems[sxSel])) { setMode("chat"); chatSend(q); }
      else if (sxItems[sxSel]) sxAct(sxItems[sxSel], e.metaKey || e.ctrlKey ? "reveal" : "open");
    }
    else if (e.key === "c" && (e.metaKey || e.ctrlKey) && sxItems[sxSel] && !window.getSelection().toString()) { e.preventDefault(); sxAct(sxItems[sxSel], "copy"); }
  });
  let sxTimer;
  $("sx-q").addEventListener("input", () => { if (sxMode === "chat") return; clearTimeout(sxTimer); sxTimer = setTimeout(sxSearch, 160); });

  // a sentence (3+ words, or a question) goes to Claude by default; a file name opens the file
  const isQuestion = q => q.split(/\s+/).filter(Boolean).length >= 3 || /\?\s*$/.test(q);
  let sxTouched = false;
  async function sxSearch() {
    const q = $("sx-q").value.trim(), seq = ++sxSeq;
    sxTouched = false;
    if (q.length < 2) return sxRender([], [], [], q);
    if (!brainNodes) brainNodes = ((await getJSON("/data/brain.json")) || {}).nodes || [];
    const ql = q.toLowerCase();
    const brain = brainNodes.filter(n => n.kind !== "run" && [n.label, n.path, n.note].some(f => f && String(f).toLowerCase().includes(ql))).slice(0, 6)
      .map(n => ({ name: n.label, path: n.path, kind: "brain", area: n.area, dir: homeTilde(n.path), openable: true }));
    sxRender(brain, null, null, q);
    const find = async scope => ((await getJSON(`/search?scope=${scope}&q=${encodeURIComponent(q)}`)) || {}).results || [];
    const names = await find("name");
    if (seq !== sxSeq) return;
    const seen = new Set(brain.map(b => b.path));
    const nm = names.filter(r => !seen.has(r.path));
    sxRender(brain, nm, null, q);
    const content = await find("content");  // slower: arrives second
    if (seq !== sxSeq) return;
    nm.forEach(r => seen.add(r.path));
    sxRender(brain, nm, content.filter(r => !seen.has(r.path)).slice(0, 15), q);
  }

  function sxRender(brain, names, content, q) {
    const keep = sxItems[sxSel]?.path;
    sxItems = [...brain, ...(names || []), ...(content || [])];
    sxSel = sxTouched ? Math.max(-1, sxItems.findIndex(x => x.path === keep)) : (isQuestion(q) || !sxItems.length ? -1 : 0);
    const row = (x, i) => `<div class="sx-row" data-i="${i}"><span class="ki">${ph(SX_ICON[x.kind] || "file-text")}</span>` +
      `<span style="min-width:0"><div class="nm">${esc(x.name)}${x.area && x.area !== "core" ? areaTag(x.area) : ""}</div><div class="pt">${esc(homeTilde(x.dir || ""))}</div></span>` +
      `<span class="rt">${x.openable === false ? "" : `<button data-sx="open">open</button>`}<button data-sx="reveal">reveal</button><button data-sx="copy">copy</button></span></div>`;
    let i = 0, h = "";
    const sec = (title, arr, loading) => {
      if (!arr && !loading) return;
      h += `<div class="sx-sec">${title}${loading ? `<span class="spin"></span>` : arr ? ` · ${arr.length}` : ""}</div>`;
      (arr || []).forEach(x => { h += row(x, i++); });
    };
    if (q.length < 2) { $("sx-res").innerHTML = `<div class="sx-empty">Type at least 2 letters. Searches projects, files, folders, images and documents on this computer (private folders excluded).</div>`; return; }
    // first row: ask Claude instead of searching
    h += `<div class="sx-row ask" data-ask="1"><span class="ki">${ph("sparkle")}</span><span style="min-width:0"><div class="nm">Ask Claude: “${esc(q)}”</div><div class="pt">edit, add, note some context, ask a question</div></span><span class="rt" style="opacity:1"><kbd>↵</kbd></span></div>`;
    if (brain.length) sec("Projects & memory", brain);
    sec("Files & folders", names, names === null);
    if (names !== null) sec("In content", content && content.length ? content : content ? [] : null, content === null);
    if (!sxItems.length && names !== null && content !== null) h += `<div class="sx-empty">No file for “${esc(q)}” · ↵ to send it to Claude</div>`;
    $("sx-res").innerHTML = h;
    sxMark();
  }
  function sxMark() {
    document.querySelectorAll(".sx-row").forEach(r => r.classList.toggle("on", r.dataset.ask ? sxSel < 0 : +r.dataset.i === sxSel));
    document.querySelector(".sx-row.on")?.scrollIntoView({ block: "nearest" });
  }
  async function sxAct(x, how) {
    if (!x || !x.path) return;
    if (how === "copy") { try { await navigator.clipboard.writeText(x.path); } catch {} flashSx("Path copied"); return; }
    try {
      const r = await POST("/open", { path: x.path, reveal: how === "reveal" || x.openable === false });
      if (!r.ok) throw new Error(r.status === 404 ? "restart the server" : r.status);
      sxClose();
    } catch (err) { flashSx(`Could not open: ${err.message}`); }
  }
  function flashSx(t) { const f = document.querySelector(".sx-foot:not([hidden])"); if (!f) return; const old = f.innerHTML; f.innerHTML = `<span style="color:var(--accent)">${esc(t)}</span>`; setTimeout(() => f.innerHTML = old, 1500); }
  $("sx-res").addEventListener("click", e => {
    if (e.target.closest("[data-ask]")) { const q = $("sx-q").value; setMode("chat"); return chatSend(q); }
    const row = e.target.closest(".sx-row"); if (!row || row.dataset.i == null) return;
    const x = sxItems[+row.dataset.i], b = e.target.closest("[data-sx]");
    sxAct(x, b ? b.dataset.sx : (x.openable === false ? "reveal" : "open"));
  });

  // ---------- chat with Claude (same palette) ----------
  let chatBusy = false;
  function setMode(mode) {
    sxMode = mode;
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === mode));
    document.querySelector(".sx").classList.toggle("chat", mode === "chat");
    $("sx-foot-search").hidden = mode === "chat"; $("sx-foot-chat").hidden = mode !== "chat";
    $("sx-ic").innerHTML = ph(mode === "chat" ? "sparkle" : "magnifying-glass");
    $("sx-q").placeholder = mode === "chat" ? "Ask Claude: move a milestone, add a project, note that…" : "File, folder, project, image, document…";
    $("sx-q").focus();
    if (mode === "chat") chatLoad(); else { sxRender([], [], [], $("sx-q").value.trim()); sxSearch(); }
  }
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  // Markdown-light: escaped first, then bold, code, bullet lists and paragraphs
  function md(t) {
    const lines = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").split("\n");
    let h = "", inList = false;
    lines.forEach(l => {
      const m = /^\s*[-*•] (.+)/.exec(l);
      if (m) { if (!inList) { h += "<ul>"; inList = true; } h += `<li>${m[1]}</li>`; return; }
      if (inList) { h += "</ul>"; inList = false; }
      if (l.trim()) h += `<p>${l}</p>`;
    });
    return h + (inList ? "</ul>" : "");
  }
  const TOOL_LABEL = { Read: "reads", Glob: "searches", Grep: "searches", Edit: "edits", Write: "writes" };
  function chatItem(x) {
    if (x.t === "user") return `<div class="msg user">${(x.images || []).length ? `<div class="imgs">${x.images.map(i => `<a href="/chat/upload/${esc(i)}" target="_blank" rel="noopener"><img src="/chat/upload/${esc(i)}" alt="attached image"></a>`).join("")}</div>` : ""}${esc(x.text)}</div>`;
    if (x.t === "text") return `<div class="msg ai">${md(x.text)}</div>`;
    if (x.t === "tool") return `<div class="msg tool ${x.name === "Edit" || x.name === "Write" ? "edit" : ""}">${ph(x.name === "Edit" || x.name === "Write" ? "check-circle" : "file-text")}${esc(TOOL_LABEL[x.name] || x.name)} ${esc(homeTilde(x.target || ""))}</div>`;
    if (x.t === "error") return `<div class="msg err">${esc(x.text)}</div>`;
    if (x.t === "done") return x.changed ? `<div class="msg sys">changes saved${x.check ? " · map: " + esc(x.check) : ""}</div>` : "";
    return "";
  }
  const CHAT_HINT = `<div class="chat-hint">Talk to Claude right from the dashboard. It reads your files and only edits files inside this OS folder (milestones, projects, tasks, ideas, costs). Examples:<br>
    · <b>move the beta milestone to next Friday</b><br>· <b>add a project “Garden” with a launch in January</b><br>· <b>note that the client call moved to Thursday</b><br>· <b>where am I on the website redesign?</b></div>`;
  async function chatLoad() {
    const h = (await getJSON("/chat/history")) || { items: [] };
    const items = Array.isArray(h.items) ? h.items : [];
    $("sx-res").innerHTML = items.length ? items.map(chatItem).join("") : CHAT_HINT;
    $("sx-res").scrollTop = 1e9;
    if (h.busy) $("sx-res").insertAdjacentHTML("beforeend", `<div class="msg sys"><span class="spin"></span>Claude is replying…</div>`);
  }
  // ---------- attached images: paste (⌘V) or drag and drop into the palette ----------
  let attachments = [];  // { name, url, loading }
  function renderAtt() {
    $("sx-att").hidden = !attachments.length;
    $("sx-att").innerHTML = attachments.map((a, i) => `<div class="att ${a.loading ? "loading" : ""}"><img src="${esc(a.url)}" alt=""><button data-unatt="${i}" title="Remove">×</button></div>`).join("");
  }
  async function addImages(files) {
    const imgs = [...files].filter(f => /^image\/(png|jpeg|gif|webp)$/.test(f.type));
    if (!imgs.length) return false;
    if (sxMode !== "chat") setMode("chat");
    for (const f of imgs) {
      const a = { url: URL.createObjectURL(f), loading: true };
      attachments.push(a); renderAtt();
      try {
        const r = await POST("/chat/upload", f, false).catch(e => { throw e; });
        if (!r.ok) throw new Error(r.status === 413 ? "image too large (10 MB max)" : r.status === 404 ? "restart the server" : r.status);
        a.name = (await r.json()).name; a.loading = false;
      } catch (e) { attachments = attachments.filter(x => x !== a); alert(`Image not added: ${e.message}`); }
      renderAtt();
    }
    $("sx-q").focus();
    return true;
  }
  $("sx-q").addEventListener("paste", e => {
    const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === "file").map(i => i.getAsFile()).filter(Boolean);
    if (files.some(f => f.type.startsWith("image/"))) { e.preventDefault(); addImages(files); }
  });
  const sxBox = document.querySelector(".sx");
  sxBox.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); sxBox.classList.add("dragover"); } });
  sxBox.addEventListener("dragleave", () => sxBox.classList.remove("dragover"));
  sxBox.addEventListener("drop", e => { if (e.dataTransfer.files.length) { e.preventDefault(); sxBox.classList.remove("dragover"); addImages(e.dataTransfer.files); } });
  $("sx-att").addEventListener("click", e => { const b = e.target.closest("[data-unatt]"); if (b) { attachments.splice(+b.dataset.unatt, 1); renderAtt(); } });

  async function chatSend(text) {
    text = (text || "").trim();
    if (attachments.some(a => a.loading)) return;  // wait for the images to finish uploading
    const images = attachments.map(a => a.name).filter(Boolean);
    if ((!text && !images.length) || chatBusy) return;
    chatBusy = true;
    $("sx-q").value = "";
    attachments = []; renderAtt();
    if ($("sx-res").querySelector(".chat-hint")) $("sx-res").innerHTML = "";
    $("sx-res").insertAdjacentHTML("beforeend", chatItem({ t: "user", text: text || "Look at this image.", images }) + `<div class="msg sys" id="chat-wait"><span class="spin"></span>Claude is thinking…</div>`);
    $("sx-res").scrollTop = 1e9;
    try {
      const r = await POST("/chat", { message: text, images });
      if (r.status === 404) throw new Error("restart the server (↻ restart)");
      if (r.status === 503) { const m = (await r.json().catch(() => ({}))).error || "Claude Code is not available on this machine."; throw Object.assign(new Error(m), { plain: true }); }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          let x;
          try { x = JSON.parse(line); } catch { continue; }
          $("chat-wait")?.insertAdjacentHTML("beforebegin", chatItem(x));
          if (x.t === "done") { $("chat-cost").textContent = x.cost != null ? `last exchange ≈ ${money(x.cost)}` : ""; if (x.changed) refresh(); }
          $("sx-res").scrollTop = 1e9;
        }
      }
    } catch (e) {
      $("chat-wait")?.insertAdjacentHTML("beforebegin", chatItem({ t: "error", text: e.plain ? e.message : `Failed: ${e.message}` }));
    }
    $("chat-wait")?.remove();
    chatBusy = false;
    $("sx-q").focus();
  }
  $("chat-new").onclick = async () => {
    try { await POST("/chat/new", undefined, false); } catch {}
    $("sx-res").innerHTML = CHAT_HINT; $("chat-cost").textContent = ""; $("sx-q").focus();
  };

  // ---------- small SVG line chart (one axis), shared by Business and custom pages ----------
  // series: [{ name, color, points: [{ date: "YYYY-MM-DD", v }], dash?, width? }]
  function lineChart(el, title, series, fmt, headline) {
    series = series.filter(s => s.points.length);
    const dates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort();
    if (!series.length || dates.length < 2) { el.innerHTML = `<div class="ct">${esc(title)}</div><p class="empty">The chart appears after a few days of data.</p>`; return; }
    const W = 640, H = 150, L = 4, R = series.length > 1 ? 86 : 8, T = 8, B = 16;
    const D = dates.map(parseDay), t0 = +D[0], t1 = +D[D.length - 1];
    const vals = series.flatMap(s => s.points.map(p => p.v));
    const vmax = Math.max(1, ...vals) * 1.12, vmin = Math.min(0, ...vals) * 1.12;
    const x = d => L + (W - L - R) * ((+d - t0) / ((t1 - t0) || 1)), y = v => T + (H - T - B) * (1 - (v - vmin) / ((vmax - vmin) || 1));
    series.forEach(s => { s.points.sort((a, b) => a.date.localeCompare(b.date)); s.byDate = new Map(s.points.map(p => [p.date, p.v])); s.lastP = s.points[s.points.length - 1]; });
    const lines = series.map(s => `<path d="${s.points.map((p, i) => `${i ? "L" : "M"}${x(parseDay(p.date)).toFixed(1)},${y(p.v).toFixed(1)}`).join("")}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join("");
    // names at the end of the lines, spread so they don't overlap
    let prevY = -1e9;
    const ends = series.length > 1 ? series.map(s => ({ s, yy: y(s.lastP.v) })).sort((a, b) => a.yy - b.yy).map(({ s, yy }) => {
      yy = Math.max(yy, prevY + 11); prevY = yy;
      return `<text x="${(x(parseDay(s.lastP.date)) + 5).toFixed(1)}" y="${(yy + 3).toFixed(1)}" class="dl">${esc(String(s.name).slice(0, 13))}</text>`;
    }).join("") : "";
    const last = D.length - 1;
    const ticks = [0, last].map(i => `<text x="${x(D[i]).toFixed(1)}" y="${H - 2}" class="ax" text-anchor="${i ? "end" : "start"}">${ddmm(D[i])}</text>`).join("");
    const total = headline !== undefined ? (typeof headline === "function" ? headline(series) : headline) : series.reduce((a, s) => a + s.lastP.v, 0);
    el.innerHTML = `<div class="ct">${esc(title)}${total == null ? "" : `<span class="cv">${esc(fmt(total))}</span>`}</div>` +
      (series.length > 1 ? `<div class="legend">${series.map(s => `<span><i class="${s.dash ? "dash" : ""}" style="${s.dash ? `color:${esc(s.color)}` : `background:${esc(s.color)}`}"></i>${esc(s.name)} · ${esc(fmt(s.lastP.v))}</span>`).join("")}</div>` : "") +
      `<div class="plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><line x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="base"/>${lines}${ends}${ticks}` +
      `<line class="cross" y1="${T}" y2="${H - B}" visibility="hidden"/></svg><div class="tip" hidden></div></div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), cross = el.querySelector(".cross");
    svg.addEventListener("mousemove", e => {
      const fx = (e.offsetX / svg.clientWidth) * W;
      let i = 0; D.forEach((d, j) => { if (Math.abs(x(d) - fx) < Math.abs(x(D[i]) - fx)) i = j; });
      cross.setAttribute("x1", x(D[i])); cross.setAttribute("x2", x(D[i])); cross.setAttribute("visibility", "visible");
      tip.hidden = false; tip.style.left = `${(x(D[i]) / W) * 100}%`;
      tip.innerHTML = `<b>${ddmm(D[i])}</b>` + series.filter(s => s.byDate.has(dates[i])).map(s => `<div><i style="background:${esc(s.color)}"></i>${series.length > 1 ? esc(s.name) + " · " : ""}${esc(fmt(s.byDate.get(dates[i])))}</div>`).join("");
    });
    svg.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  // ---------- Business page: revenue (optional metrics routine) vs editable costs ----------
  const PERIODS = ["month", "year", "week", "once"];
  const PERIOD_PER_MONTH = { month: 1, year: 1 / 12, week: 52 / 12, once: 0 };
  const PERIOD_ORDER = { week: 0, month: 1, year: 2, once: 3 };
  const CURRENCIES = [...new Set([CUR.code, "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY"])];
  let costs = null, costTimer = null, gainHist = [];
  const base = v => fmtCur(v, CUR.code);

  // Gains vs costs: one line per revenue source (monthly revenue), monthly costs, and the net.
  function drawGain(monthlyCost) {
    const el = $("ch-gain");
    if (!el) return;
    const prodRev = x => +(x.mrr ?? x.mrr_eur ?? x.value ?? 0) || 0;
    const names = [...new Set(gainHist.flatMap(p => (p.products || []).map(x => x.name)))];
    const rev = (p, n) => p.products ? prodRev(p.products.find(x => x.name === n) || {}) : 0;
    const total = p => p.products && p.products.length ? p.products.reduce((a, x) => a + prodRev(x), 0) : +(p.mrr || 0);
    const series = names.length ? names.map((n, i) => ({ name: n, color: PALETTE[i % PALETTE.length], points: gainHist.map(p => ({ date: p.date, v: rev(p, n) })) }))
      : [{ name: "Revenue", color: PALETTE[0], points: gainHist.map(p => ({ date: p.date, v: total(p) })) }];
    series.push({ name: "Costs", color: "#8a8781", dash: true, points: gainHist.map(p => ({ date: p.date, v: -monthlyCost })) });
    series.push({ name: "Net", color: "#e8e5de", width: 2.5, points: gainHist.map(p => ({ date: p.date, v: total(p) - monthlyCost })) });
    lineChart(el, "Gains vs costs · per month", series, base, s => { const n = s.find(x => x.name === "Net"); return n.points[n.points.length - 1].v; });
  }

  async function renderBusiness() {
    if (!PAGE.business) return;
    const [m, hist, c] = await Promise.all([getJSON("/data/metrics.json"), getJSON("/state/metrics-history.json"), getJSON("/state/costs.json")]);
    costs = c && Array.isArray(c.items) ? c : { items: [], fx: {} };
    costs.fx = { [CUR.code]: 1, ...(CUR.code !== "USD" ? { USD: CUR.rate } : {}), ...(costs.fx || {}) };
    const mc = m && m.currency ? String(m.currency).toUpperCase() : CUR.code;
    const mon = v => fmtCur(v, mc);
    let h = "";
    if (!m) h += `<div class="warnline">No revenue data yet. Revenue needs a routine that writes <b>dashboard/data/metrics.json</b> (for example from your payment provider). Costs below work without it.</div>`;
    const age = m && m.updated_at ? `updated ${ddmm(new Date(m.updated_at))} ${hhmm(new Date(m.updated_at))}` : "";
    const stats = m ? [
      m.mrr != null ? `<b>${esc(mon(m.mrr))}</b> monthly recurring revenue` : "",
      m.active_subscriptions != null ? `<b>${esc(num(m.active_subscriptions))}</b> active subscribers` : "",
      m.new_30d != null ? `30 d: <b>+${esc(num(m.new_30d))}</b> new` : "",
      m.canceled_30d != null ? `<b>${esc(num(m.canceled_30d))}</b> cancellation(s)` : "",
      m.failed_payments_30d != null ? `<b>${esc(num(m.failed_payments_30d))}</b> failed payment(s)` : "",
      (m.revenue_30d ?? m.revenue_30d_eur) != null ? `<b>${esc(mon(m.revenue_30d ?? m.revenue_30d_eur))}</b> collected in 30 d` : "",
    ].filter(Boolean).join(" · ") : "";
    h += `<section class="blk"><div class="bh"><span class="bt" data-ic="chart-line-up">Revenue</span><span class="ts">${age}</span></div>` +
      (stats ? `<div class="mini-stats">${stats}</div>` : "") + `<div class="chart" id="ch-gain"></div></section>`;
    h += `<section class="blk"><div class="bh"><span class="bt" data-ic="receipt">Costs</span><span class="ts" id="cost-msg">edit in place · saved automatically</span></div>` +
      `<table class="costs"><thead><tr><th></th>${[["name", "Item"], ["amount", "Amount"], ["currency", "Currency"], ["period", "Period"], ["renews", "Renews"]].map(([k, l]) =>
        `<th><button class="sorth ${k === "amount" ? "r" : ""}" data-sort="${k}" title="Sort by ${l.toLowerCase()}">${l}<span class="arr"></span></button></th>`).join("")}<th></th></tr></thead><tbody id="cost-rows"></tbody></table>` +
      `<button class="lnk" id="cost-add">+ add a line</button><div class="cost-total" id="cost-total"></div></section>`;
    $("biz").innerHTML = h;
    icons($("biz"));
    const histPts = m && Array.isArray(m.history) ? m.history : (hist && Array.isArray(hist.points) ? hist.points : []);
    gainHist = histPts.filter(p => p && p.date && ((p.products && p.products.length) || p.mrr != null)).map(p => ({ ...p, date: String(p.date).slice(0, 10) }));
    renderCosts();  // also draws the chart (it depends on the costs)
    $("cost-add").onclick = () => { costs.items.push({ name: "", amount: null, currency: CUR.code, period: "month", renews: null }); renderCosts(); saveCosts(); };
  }

  function renderCosts() {
    const opt = (vals, cur) => vals.map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
    $("cost-rows").innerHTML = costs.items.map((c, i) => `<tr data-i="${i}">` +
      `<td class="grip" draggable="true" title="Drag to move">⠿</td>` +
      `<td><input data-f="name" value="${esc(c.name || "")}" placeholder="Item"></td>` +
      `<td><input data-f="amount" type="number" min="0" step="0.01" value="${esc(c.amount ?? "")}" placeholder="to fill in" class="num ${c.amount == null ? "todo" : ""}"></td>` +
      `<td><select data-f="currency">${opt([...new Set([...CURRENCIES, c.currency || CUR.code])], c.currency || CUR.code)}</select></td>` +
      `<td><select data-f="period">${opt([...new Set([...PERIODS, c.period || "month"])], c.period || "month")}</select></td>` +
      `<td><input data-f="renews" type="date" value="${esc(c.renews || "")}"></td>` +
      `<td><button class="lnk" data-del="${i}" title="Delete the line">×</button></td></tr>`).join("");
    document.querySelectorAll(".sorth").forEach(b => {
      const on = costSort && costSort.key === b.dataset.sort;
      b.classList.toggle("on", on);
      b.querySelector(".arr").textContent = on ? (costSort.dir > 0 ? " ↑" : " ↓") : "";
    });
    costTotal();
  }

  // Sort by column (2nd click = reverse); the resulting order is saved. Empty cells always go last.
  let costSort = null;
  function sortCosts(key) {
    costSort = { key, dir: costSort && costSort.key === key ? -costSort.dir : 1 };
    const val = c => key === "period" ? PERIOD_ORDER[c.period] : key === "amount" ? c.amount : (c[key] || null);
    costs.items.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null || va === "") return 1;
      if (vb == null || vb === "") return -1;
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { sensitivity: "base" })) * costSort.dir;
    });
    renderCosts(); saveCosts();
  }
  document.addEventListener("click", e => { const b = e.target.closest(".sorth"); if (b) sortCosts(b.dataset.sort); });

  // Drag and drop by the ⠿ handle
  let dragFrom = null;
  document.addEventListener("dragstart", e => {
    const g = e.target.closest?.("#cost-rows .grip");
    if (!g) return;
    dragFrom = +g.closest("tr").dataset.i;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragFrom));
    g.closest("tr").classList.add("dragging");
  });
  document.addEventListener("dragover", e => {
    const tr = e.target.closest?.("#cost-rows tr");
    if (dragFrom == null || !tr) return;
    e.preventDefault();
    document.querySelectorAll("#cost-rows tr").forEach(r => r.classList.remove("drop-above", "drop-below"));
    const below = e.clientY > tr.getBoundingClientRect().top + tr.offsetHeight / 2;
    tr.classList.add(below ? "drop-below" : "drop-above");
  });
  document.addEventListener("drop", e => {
    const tr = e.target.closest?.("#cost-rows tr");
    if (dragFrom == null || !tr) return;
    e.preventDefault();
    let to = +tr.dataset.i + (tr.classList.contains("drop-below") ? 1 : 0);
    const [moved] = costs.items.splice(dragFrom, 1);
    if (to > dragFrom) to--;
    costs.items.splice(to, 0, moved);
    dragFrom = null; costSort = null;  // manual order: no active sort any more
    renderCosts(); saveCosts();
  });
  document.addEventListener("dragend", () => {
    dragFrom = null;
    document.querySelectorAll("#cost-rows tr").forEach(r => r.classList.remove("dragging", "drop-above", "drop-below"));
  });

  function costTotal() {
    const fx = costs.fx, rate = cur => fx[cur] ?? 1;
    let monthly = 0, once = 0, missing = 0;
    costs.items.forEach(c => {
      if (c.amount == null) { if (c.name) missing++; return; }
      const v = c.amount * rate(c.currency || CUR.code);
      if (c.period === "once") once += v; else monthly += v * (PERIOD_PER_MONTH[c.period] ?? 1);
    });
    const os = (data.today || {}).os_cost_30d || {};
    const osTotal = ["routines", "sessions", "probe", "chat", "mail"].reduce((a, k) => a + (+os[k] || 0), 0);
    drawGain(monthly);
    const conv = Object.entries(fx).filter(([k]) => k !== CUR.code).map(([k, v]) => `1 ${esc(k)} = ${esc(v)} ${esc(CUR.code)}`).join(" · ");
    $("cost-total").innerHTML = `<div class="ctot"><span>Monthly total</span><b>${esc(base(monthly))}</b></div>` +
      `<div class="csub">${esc(base(monthly * 12))} per year${once ? ` · one-off costs ${esc(base(once))} (not in total)` : ""}${missing ? ` · <span style="color:var(--warn)">${missing} amount(s) to fill in</span>` : ""}</div>` +
      `<div class="csub">${conv ? `Conversion: ${conv} (approximate) · ` : ""}Claude usage by the OS over 30 days: ≈ ${money(osTotal)} at API prices${PLAN === "api" ? ", billed to your API account" : ", included in your subscription"}</div>`;
  }

  function saveCosts() {
    clearTimeout(costTimer);
    costTimer = setTimeout(async () => {
      try {
        const r = await POST("/costs", { items: costs.items, fx: costs.fx });
        if (!r.ok) throw new Error(r.status === 404 ? "restart the server" : r.status);
        $("cost-msg").textContent = "saved ✓";
      } catch (e) { $("cost-msg").textContent = `not saved: ${e.message}`; }
    }, 500);
  }

  document.addEventListener("input", e => {
    const f = e.target.dataset.f, row = e.target.closest("#cost-rows tr");
    if (!f || !row) return;
    const c = costs.items[+row.dataset.i];
    if (f === "amount") { const v = parseFloat(e.target.value); c.amount = isNaN(v) ? null : Math.max(0, v); e.target.classList.toggle("todo", c.amount == null); }
    else c[f] = e.target.value || (f === "renews" ? null : "");
    costTotal(); $("cost-msg").textContent = "…"; saveCosts();
  });
  document.addEventListener("click", e => {
    const d = e.target.closest("[data-del]");
    if (!d) return;
    costs.items.splice(+d.dataset.del, 1); renderCosts(); saveCosts();
  });

  // ---------- custom pages: generic renderer for data/page-<id>.json ----------
  const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" ? x : null; } catch { return null; } };
  const dayLabel = s => { if (!/^\d{4}-\d{2}-\d{2}/.test(String(s || ""))) return esc(s || ""); const d = parseDay(s); return `${WD[d.getDay()]} ${ddmm(d)}`; };
  const SECTION = {
    kpis: s => `<div class="ops-tot">${(s.items || []).map(k => {
      const dl = String(k.delta ?? ""), cls = /^\s*\+/.test(dl) ? "up" : /^\s*[-−]/.test(dl) ? "down" : "";
      return `<div><span class="k">${esc(k.label)}</span><b>${esc(k.value ?? "–")}</b><span class="s">${dl ? `<span class="delta ${cls}">${esc(dl)}</span>` : ""}${esc(k.hint || "")}</span></div>`;
    }).join("")}</div>`,
    list: s => (s.items || []).length ? `<ul class="cp-list">${s.items.map(it => {
      const u = safeUrl(it.url), title = esc(it.title || "");
      const t = u ? `<a class="inl" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" title="${esc(u.href)}">${safeHosts.has(u.hostname) ? "" : "⚠ "}${title}</a>` : title;
      return `<li><span class="t">${t}${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ""}</span><span class="dt">${dayLabel(it.date)}</span>${it.detail ? `<span class="d">${esc(it.detail)}</span>` : ""}</li>`;
    }).join("")}</ul>` : `<p class="empty">Nothing.</p>`,
    chart: s => `<div class="chart" data-chart="1"></div>`,
    table: s => `<div class="cp-table"><table class="ptable"><thead><tr>${(s.columns || []).map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>` +
      `<tbody>${(s.rows || []).map(r => `<tr>${(Array.isArray(r) ? r : [r]).map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
    text: s => `<div class="cp-text">${md(s.text || "")}</div>`,
  };
  async function renderCustom(pg) {
    const el = $(`page-${pg.id}`);
    if (!el) return;
    const d = await getJSON(`/data/page-${encodeURIComponent(pg.id)}.json`);
    if (current !== pg.id) return;
    if (!d || !Array.isArray(d.sections)) {
      el.innerHTML = `<div class="cp-empty">${ph(pg.icon && (window.PH || {})[pg.icon] ? pg.icon : "squares-four")}<p>No data yet — the routine that feeds this page has not run.</p>` +
        `<span class="ts">dashboard/data/page-${esc(pg.id)}.json</span></div>`;
      return;
    }
    const upd = d.updated_at ? new Date(d.updated_at) : null;
    const secs = d.sections.filter(s => s && SECTION[s.type]);
    el.innerHTML = `<div class="pp-head"><span class="ts">${upd && !isNaN(upd) ? `updated ${ddmm(upd)} ${hhmm(upd)}` : ""}</span></div>` +
      (secs.length ? secs.map((s, i) => `<section class="blk" data-sec="${i}">${s.title ? `<div class="bh"><span class="bt">${esc(s.title)}</span></div>` : ""}${SECTION[s.type](s)}</section>`).join("")
        : `<p class="empty">This page has no sections yet.</p>`);
    secs.forEach((s, i) => {
      if (s.type !== "chart") return;
      const box = el.querySelector(`[data-sec="${i}"] [data-chart]`);
      const unit = String(s.unit || "");
      const fmt = v => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit ? (unit === "%" ? "%" : " " + unit) : ""}`;
      const series = (s.series || []).map((x, j) => ({ name: String(x.name || `Series ${j + 1}`), color: PALETTE[j % PALETTE.length],
        points: (x.points || []).filter(p => Array.isArray(p) && /^\d{4}-\d{2}-\d{2}/.test(String(p[0])) && isFinite(+p[1])).map(p => ({ date: String(p[0]).slice(0, 10), v: +p[1] })) }));
      lineChart(box, s.title ? "" : "", series, fmt, series.length === 1 ? (ss => ss[0].lastP.v) : null);
    });
  }

  async function refresh() {
    const names = ["digest", "today", "routines", "memory-map"];
    if (MAIL_ON || $("mailbox")) names.push("inbox-live");
    await Promise.all(names.map(get));
    const dn = await getJSON("/state/done.json");
    if (dn && typeof dn === "object") done = dn;
    renderTop(); renderToday(); renderDigest(); renderRoutines();
    if (current === "projects") renderProjects();
    if (isCustom(current)) renderCustom(PAGE[current]);
  }
  showPage(location.hash.slice(1));  // right away, without a flash of the Brain page
  // when an area colour changes (brain), tags and project cards follow
  window.addEventListener("areacolors", () => { renderDigest(); renderProjects(); renderInbox(); if (current === "business") renderBusiness(); });
  window.AREA_PREFS.then(() => window.dispatchEvent(new Event("areacolors")));
  refresh().then(() => { if (current === "business") renderBusiness(); if (current === "projects") renderProjects(); });
  setInterval(refresh, APP.REFRESH_MS);
})();
