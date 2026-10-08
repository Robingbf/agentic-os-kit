// Projects page: board of projects by status (#projects) and the full page of a project (#projects/<id>[/<tab>]).
// Data: /projects and /projects/<id> (dashboard/projects.py → projects/<id>.json). Statuses, task columns and importance
// levels come from os.config.json → "projects" (sent by the server as "schema"). Every edit is an operation sent to the
// server, which answers with the updated project: the screen is redrawn from that answer.
(function () {
  const root = document.getElementById("projpage");
  if (!root) return;

  const TABS = [{ id: "overview", label: "Overview" }, { id: "tasks", label: "Tasks" }, { id: "timeline", label: "Timeline" }, { id: "ideas", label: "Ideas" }];
  const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#8a63d2", "#77746d"];

  // schema (replaced by the server's on every answer)
  let S = null, STATUSES = [], COLUMNS = [], IMP = {}, IMP_IDS = [];
  function setSchema(s) {
    if (!s || !Array.isArray(s.statuses)) return;
    S = s; STATUSES = s.statuses; COLUMNS = s.columns;
    IMP = Object.fromEntries(s.importance.map(x => [x.id, { label: x.label, color: x.color }]));
    IMP_IDS = s.importance.map(x => x.id);
  }
  const imp = id => IMP[id] || { label: id, color: "#8a8781" };
  const TOP = () => IMP_IDS[IMP_IDS.length - 1], SECOND = () => IMP_IDS.length > 1 ? IMP_IDS[IMP_IDS.length - 2] : null;
  const colLabel = id => (COLUMNS.find(c => c.id === id) || { label: id }).label;
  const stLabel = id => (STATUSES.find(c => c.id === id) || { label: id }).label;

  const toHex = c => /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#77746d";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ph = n => (window.ph ? window.ph(n) : "");
  const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const color = id => (window.AREA_COLOR && window.AREA_COLOR[id]) || PALETTE[hash(id) % PALETTE.length];
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const daysTo = iso => Math.round((new Date(iso + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000);
  const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
  const fmtDay = iso => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit" });
  const fmtFull = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(); };
  const jx = n => n === 0 ? "today" : n > 0 ? `in ${n} d` : `${-n} d late`;
  const dueClass = iso => { if (!iso) return ""; const n = daysTo(iso); return n < 0 ? "late" : n <= 3 ? "soon" : ""; };
  const msLabel = l => String(l || "").replace(/^[^:]+:\s*/, "");
  // optional area logo (os.config.json → areas[].logo, served from dashboard/vendor/logos/)
  const logoSrc = id => {
    const a = ((window.OS_CONFIG || {}).areas || []).find(x => x && x.id === id), l = a && a.logo;
    return typeof l !== "string" ? null : /^\/vendor\/logos\/[\w.-]+\.png$/.test(l) ? l : /^[\w.-]+\.png$/.test(l) ? `/vendor/logos/${l}` : /^[\w-]+$/.test(l) ? `/vendor/logos/${l}.png` : null;
  };
  const logo = (id, label, cls = "pj-logo") => logoSrc(id)
    ? `<img class="${cls}" src="${esc(logoSrc(id))}" alt="">`
    : `<span class="${cls} ini" style="--c:${color(id)}">${esc((label || id)[0].toUpperCase())}</span>`;
  const linkHTML = (l, i) => `<li>${/^https?:/i.test(l.url) ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${ph("arrow-square-out")}${esc(l.label)}</a>`
    : `<a href="#" data-open-path="${esc(l.url)}" title="${esc(l.url)}">${ph("file-text")}${esc(l.label)}</a>`}<button class="lnk" data-del-link="${i}" title="Remove">×</button></li>`;

  let list = [], cur = null, view = { pid: null, tab: "overview" }, filters = { q: "", imp: new Set(), showDone: false }, editing = null, busy = false, shown = false;

  async function api(path, body) {
    const r = await fetch(path, body ? { method: "POST", headers: { "X-Dashboard": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || (r.status === 404 && !d.error ? "restart the server" : `HTTP ${r.status}`));
    if (d && d.schema) setSchema(d.schema);
    return d;
  }
  async function op(name, args) {
    try { cur = await api(`/projects/${cur.id}`, { op: name, args }); renderProject(); return true; }
    catch (e) { toast(`Not saved: ${e.message}`, true); return false; }
  }
  function toast(msg, err) {
    let t = root.querySelector(".pj-toast");
    if (!t) { t = document.createElement("div"); t.className = "pj-toast"; root.appendChild(t); }
    t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600);
  }

  // ---------- drag and drop with pointer events (HTML5 drag and drop fails in the macOS desktop app's web view) ----------
  // items: draggable cards; cols: drop zones; onDrop(itemEl, colEl, beforeEl|null)
  let suppressClick = false;
  function dragAndDrop(items, cols, onDrop) {
    items.forEach(el => el.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest("a, button, input, select, textarea, [data-stop]")) return;
      const sx = e.clientX, sy = e.clientY, rect = el.getBoundingClientRect();
      let ghost = null, over = null, before = null;
      const clear = () => { cols.forEach(c => c.classList.remove("over")); root.querySelectorAll(".drop-before,.drop-end").forEach(x => x.classList.remove("drop-before", "drop-end")); };
      const move = ev => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = el.cloneNode(true); ghost.classList.add("drag-ghost");
          Object.assign(ghost.style, { width: rect.width + "px", left: rect.left + "px", top: rect.top + "px" });
          document.body.appendChild(ghost); el.classList.add("dragging"); document.body.classList.add("is-dragging");
        }
        ghost.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy}px) rotate(1.5deg)`;
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        clear();
        over = (hit && cols.find(c => c.contains(hit))) ||  // otherwise: the column above or below the pointer
               cols.find(c => { const r = c.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right; }) || null;
        before = null;
        if (over) {
          over.classList.add("over");
          const lst = over.querySelector(".kb-list, .pb-list") || over;
          before = [...lst.querySelectorAll(":scope > .tk:not(.dragging), :scope > .pc:not(.dragging)")].find(c => ev.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2) || null;
          before ? before.classList.add("drop-before") : lst.classList.add("drop-end");
        }
      };
      const up = () => {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
        if (!ghost) return;
        ghost.remove(); el.classList.remove("dragging"); document.body.classList.remove("is-dragging"); clear();
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
        if (over) onDrop(el, over, before);
      };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    }));
  }

  // ---------- routing: #projects, #projects/<id>, #projects/<id>/<tab> ----------
  window.ProjectsUI = {
    show(rest) {
      shown = true;
      const [pid, tab] = (rest || "").split("/").filter(Boolean);
      view = { pid: pid || null, tab: TABS.some(t => t.id === tab) ? tab : "overview" };
      editing = null;  // changing tab or project closes the task editor
      return view.pid ? openProject(view.pid) : openBoard();
    },
  };
  const go = (pid, tab) => { location.hash = pid ? `#projects/${pid}${tab && tab !== "overview" ? "/" + tab : ""}` : "#projects"; };

  // ---------- board of projects ----------
  async function openBoard() {
    cur = null;
    try { list = (await api("/projects")).projects || []; }
    catch (e) { root.innerHTML = `<p class="empty">Cannot load the projects: ${esc(e.message)}</p>`; return; }
    renderBoard();
  }
  function ideaCard(s) {
    return `<article class="pc idea" data-pid="${esc(s.id)}" style="--c:${color(s.id)}" tabindex="0">
      <div class="pc-h">${logo(s.id, s.label)}<b>${esc(s.label)}</b><span class="pc-edit" title="Open the idea sheet">${ph("pencil-simple")}</span></div>
      ${s.objective ? `<p class="pc-desc">${esc(s.objective)}</p>` : `<p class="pc-desc empty">Add a description…</p>`}
      ${s.for_whom ? `<div class="pc-for">${ph("users")}${esc(s.for_whom)}</div>` : ""}
      ${s.total || s.ideas ? `<div class="pc-n">${s.total ? `<span>${plural(s.total, "task")}</span>` : ""}${s.ideas ? `<span>${plural(s.ideas, "note")}</span>` : ""}</div>` : ""}
    </article>`;
  }
  function card(s) {
    if (s.status === S.idea_status) return ideaCard(s);
    const ms = s.milestone, pct = s.total ? Math.round(100 * s.done / s.total) : 0;
    const top = imp(TOP()), second = SECOND() && imp(SECOND());
    const msTxt = ms ? `<div class="pc-ms ${ms.days_left <= 7 ? "late" : ms.days_left <= 21 ? "soon" : ""}">${ph("flag")}${esc(msLabel(ms.label))} · ${jx(ms.days_left)}</div>` : "";
    const inboxOnly = s.next_tasks && s.next_tasks.length && s.next_tasks.every(t => t.col === S.inbox_column);
    return `<article class="pc" data-pid="${esc(s.id)}" style="--c:${color(s.id)}" tabindex="0">
      <div class="pc-h">${logo(s.id, s.label)}<b>${esc(s.label)}</b></div>
      ${msTxt}
      ${s.total ? `<div class="pc-bar"><span style="width:${pct}%"></span></div>
      <div class="pc-n"><span>${s.done}/${s.total} tasks</span>${s.urgent ? `<span class="imp-txt top" style="--imp:${top.color}">${s.urgent} ${esc(top.label.toLowerCase())}</span>` : ""}${s.high && second ? `<span class="imp-txt" style="--imp:${second.color}">${s.high} ${esc(second.label.toLowerCase())}</span>` : ""}${s.overdue ? `<span class="late">${s.overdue} overdue</span>` : ""}${s.blocked ? `<span>${s.blocked} blocked</span>` : ""}</div>` : `<div class="pc-n"><span>no tasks</span></div>`}
      ${s.next_tasks && s.next_tasks.length ? `<div class="pc-todo"><span class="pc-todo-h">${inboxOnly ? esc(colLabel(S.inbox_column)) : "Next tasks"}</span>${s.next_tasks.map(t => `<div class="pc-todo-i"><span class="imp-dot" style="--imp:${imp(t.importance).color}"></span><span class="tt">${esc(t.title)}</span>${t.col === "doing" ? `<em>${esc(colLabel("doing").toLowerCase())}</em>` : t.due ? `<em class="${dueClass(t.due)}">${fmtDate(t.due)}</em>` : ""}</div>`).join("")}</div>` : ""}
      ${s.next_time ? `<div class="pc-next">${ph("play")}${esc(s.next_time)}</div>` : s.stopped_at ? `<div class="pc-stop">Stopped at: ${esc(s.stopped_at)}</div>` : ""}
      ${s.ideas ? `<div class="pc-ideas">${ph("lightbulb")}${plural(s.ideas, "idea")}</div>` : ""}
    </article>`;
  }
  function renderBoard() {
    const open = list.filter(s => s.status !== "paused").reduce((a, s) => a + s.open, 0);
    root.innerHTML = `<div class="pj-top"><div><h2 class="pj-title">Projects</h2><span class="pj-sub">${plural(list.length, "project")} · ${plural(open, "open task")}</span></div>
      <button class="go" id="pj-new">${ph("plus")}New project</button></div>
      <div class="pb">${STATUSES.map(st => {
        const items = list.filter(s => s.status === st.id);
        const add = st.id === S.idea_status;
        return `<section class="pb-col" data-status="${esc(st.id)}"><header>${ph(st.icon || "folder")}<span>${esc(st.label)}</span><i>${items.length}</i>${add ? `<button class="kb-add" id="idea-add" title="New idea">${ph("plus")}</button>` : ""}</header>
          ${add ? `<div class="idea-new" id="idea-new" hidden><input id="idea-name" placeholder="Name of the idea" maxlength="60"><textarea id="idea-desc" rows="2" placeholder="In one sentence (optional)" maxlength="600"></textarea><div class="idea-new-f"><span>Enter to create · Esc to cancel</span><button class="go" id="idea-ok">Create</button></div></div>` : ""}
          <div class="pb-list">${items.map(card).join("") || `<p class="pb-empty">${add ? "Click + to note a project idea" : "Drag a project here"}</p>`}</div></section>`;
      }).join("")}</div>`;
    const ideaBox = root.querySelector("#idea-new");
    root.querySelector("#idea-add").onclick = () => { ideaBox.hidden = false; root.querySelector("#idea-name").focus(); };
    const createIdea = async () => {
      const label = root.querySelector("#idea-name").value.trim(), objective = root.querySelector("#idea-desc").value.trim();
      if (!label) { root.querySelector("#idea-name").focus(); return; }
      try { await api("/projects", { label, objective, status: S.idea_status }); toast(`Idea “${label}” added`); await openBoard(); }
      catch (e) { toast(e.message, true); }
    };
    root.querySelector("#idea-ok").onclick = createIdea;
    ideaBox.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.stopPropagation(); ideaBox.hidden = true; }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); createIdea(); }
    });
    root.querySelector("#pj-new").onclick = () => window.openFormPanel({
      title: "New project", submit: "Create",
      fields: [{ key: "label", label: "Name", placeholder: "Project name" },
               { key: "objective", label: "In one sentence (optional)", rows: 3, placeholder: "What it is" },
               { key: "status", label: "Status", value: S.start_status, options: STATUSES.map(x => ({ value: x.id, label: x.label })) }],
      onSubmit: async v => {
        if (!v.label) throw new Error("the name is required");
        const p = await api("/projects", { label: v.label, objective: v.objective, status: STATUSES.some(x => x.id === v.status) ? v.status : S.start_status });
        go(p.id); return true;
      } });
    root.querySelectorAll(".pc").forEach(el => {
      el.addEventListener("click", e => { if (!suppressClick && !e.target.closest("[data-stop]")) go(el.dataset.pid); });
      el.addEventListener("keydown", e => { if (e.key === "Enter") go(el.dataset.pid); });
    });
    dragAndDrop([...root.querySelectorAll(".pc")], [...root.querySelectorAll(".pb-col")], async (el, col) => {
      const pid = el.dataset.pid, status = col.dataset.status, sx = list.find(x => x.id === pid);
      if (!sx || sx.status === status) return;
      sx.status = status; renderBoard();  // shown at once
      try { await api(`/projects/${pid}`, { op: "set", args: { status } }); toast(`${sx.label} → ${stLabel(status)}`); }
      catch (err) { toast(err.message, true); openBoard(); }
    });
  }

  // ---------- project page ----------
  async function openProject(pid) {
    try { cur = await api(`/projects/${pid}`); }
    catch (e) { root.innerHTML = `<p class="empty">Project not found. <a href="#projects">Back to the projects</a></p>`; return; }
    renderProject();
  }
  const stats = p => {
    const t = p.tasks, open = t.filter(x => x.col !== S.done_column), today = todayISO();
    return { total: t.length, done: t.length - open.length, high: open.filter(x => x.importance === TOP() || x.importance === SECOND()).length,
             urgent: open.filter(x => x.importance === TOP()).length, late: open.filter(x => x.due && x.due < today).length,
             ideas: p.ideas.filter(i => !i.task).length };
  };
  function renderProject() {
    if (!cur) return;
    const p = cur, st = stats(p), ms = p.milestones.filter(m => m.days_left == null || m.days_left >= 0).slice(0, 3);
    const scroll = root.scrollTop;
    root.innerHTML = `<div class="pv" style="--c:${color(p.id)}">
      <div class="pv-h">
        <button class="pv-back" data-go-board title="Back to the projects">${ph("arrow-left")}</button>
        ${logo(p.id, p.label, "pv-logo")}
        <div class="pv-t"><h2><span id="pv-name">${esc(p.label)}</span><button class="pv-rename" data-rename title="Rename">${ph("pencil-simple")}</button>
          <label class="pv-color" title="Project colour (everywhere in the OS)"><input type="color" id="pv-color" value="${esc(toHex(color(p.id)))}"></label></h2>
          <div class="pv-meta"><select class="pv-status" aria-label="Project status">${STATUSES.map(s => `<option value="${esc(s.id)}" ${s.id === p.status ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>
          ${ms.map(m => `<span class="pv-ms ${m.days_left != null && m.days_left <= 7 ? "late" : m.days_left != null && m.days_left <= 21 ? "soon" : ""}">${ph("flag")}${esc(msLabel(m.label))}${m.date ? ` · ${fmtDate(m.date)} · ${jx(m.days_left)}` : ""}</span>`).join("")}</div></div>
      </div>
      <nav class="pv-tabs">${TABS.map(t => `<button data-tab="${t.id}" aria-pressed="${view.tab === t.id}">${t.label}${t.id === "tasks" ? `<i>${st.total - st.done}</i>` : t.id === "ideas" && st.ideas ? `<i>${st.ideas}</i>` : t.id === "timeline" && st.late ? `<i class="late">${st.late}</i>` : ""}</button>`).join("")}</nav>
      <div class="pv-body">${view.tab === "tasks" ? tasksTab() : view.tab === "timeline" ? timelineTab() : view.tab === "ideas" ? ideasTab() : p.status === S.idea_status ? ideaSheet() : overviewTab(st)}</div>
    </div>${editing ? editorHTML() : ""}`;
    root.scrollTop = scroll;
    bindProject();
  }

  // Overview
  function overviewTab(st) {
    const p = cur, pct = st.total ? Math.round(100 * st.done / st.total) : 0, today = todayISO();
    const upcoming = [
      ...p.tasks.filter(t => t.col !== S.done_column && t.due).map(t => ({ date: t.due, label: t.title, kind: "task", t })),
      ...p.milestones.filter(m => m.date).map(m => ({ date: m.date, label: msLabel(m.label), kind: "ms" })),
    ].filter(x => x.date >= today || x.kind === "task").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
    const recent = p.tasks.filter(t => t.col === S.done_column).sort((a, b) => (b.done_at || "").localeCompare(a.done_at || "")).slice(0, 5);
    const top = imp(TOP()), second = SECOND() ? imp(SECOND()) : top;
    return `<div class="ov-kpis">
        <div><span>Progress</span><b>${pct}%</b><div class="pc-bar"><span style="width:${pct}%"></span></div><small>${st.done} / ${st.total} tasks</small></div>
        <div><span>${esc(top.label)} and ${esc(second.label.toLowerCase())}</span><b class="${st.high ? "imp-txt" : ""}" style="--imp:${st.urgent ? top.color : second.color}">${st.high}</b><small>${st.urgent ? `incl. ${st.urgent} ${esc(top.label.toLowerCase())}` : "open tasks"}</small></div>
        <div><span>Overdue</span><b class="${st.late ? "late" : ""}">${st.late}</b><small>due date passed</small></div>
        <div><span>Ideas</span><b>${st.ideas}</b><small>not a task yet</small></div>
      </div>
      <div class="ov-next" data-edit-field="next_time" title="Click to edit">${ph("play")}<div><span>Next time</span>
        <p>${p.next_time ? esc(p.next_time) : `<em>What you want to start with next time. Filled in automatically when you say it in a session (“next time…”), or click to write it.</em>`}</p></div></div>
      <div class="ov-grid">
        <section class="blk"><div class="bh"><span class="bt">${ph("clock")}Last session</span><span class="ts">${esc(p.journal.when || "")}</span></div>
          ${p.journal.summary ? `<p class="ov-p">${esc(p.journal.summary)}</p>` : `<p class="empty">No session journal yet.</p>`}
          ${p.journal.stopped_at ? `<p class="ov-stop"><b>Stopped at:</b> ${esc(p.journal.stopped_at)}</p>` : ""}</section>
        <section class="blk"><div class="bh"><span class="bt">${ph("target")}Objective</span><button class="lnk" data-edit-field="objective">edit</button></div>
          ${p.objective ? `<p class="ov-p">${esc(p.objective)}</p>` : `<p class="empty">No objective yet. <button class="lnk" data-edit-field="objective">Add</button></p>`}</section>
        <section class="blk"><div class="bh"><span class="bt">${ph("calendar-blank")}Coming up</span><button class="lnk" data-tab="timeline">timeline</button></div>
          ${upcoming.length ? `<ul class="ov-up">${upcoming.map(x => `<li ${x.t ? `data-task="${esc(x.t.id)}"` : ""} class="${x.kind}"><span class="d ${x.kind === "task" ? dueClass(x.date) : ""}">${fmtDate(x.date)}</span>${x.kind === "ms" ? `<i class="dia"></i>` : `<i class="pdot" style="background:${imp(x.t.importance).color}"></i>`}<span class="l">${esc(x.label)}</span><span class="j">${jx(daysTo(x.date))}</span></li>`).join("")}</ul>` : `<p class="empty">No due dates. Add a date to a task to see it here.</p>`}</section>
        <section class="blk"><div class="bh"><span class="bt">${ph("link")}Links</span><button class="lnk" data-add-link>+ add</button></div>
          ${p.links.length ? `<ul class="ov-links">${p.links.map(linkHTML).join("")}</ul>` : `<p class="empty">No links yet (repository, store, website, docs…).</p>`}</section>
        <section class="blk ov-wide"><div class="bh"><span class="bt">${ph("check-circle")}Recently done</span><button class="lnk" data-tab="tasks">all tasks</button></div>
          ${recent.length ? `<ul class="ov-done">${recent.map(t => `<li>${esc(t.title)}<span>${t.done_at ? fmtFull(t.done_at) : ""}</span></li>`).join("")}</ul>` : `<p class="empty">Nothing done yet.</p>`}</section>
      </div>`;
  }

  // Idea sheet (first status): everything is edited in place, saved when leaving the field
  function ideaSheet() {
    const p = cur, next = stLabel(S.start_status);
    const field = (f, label, hint, rows, max) => `<label class="if-l" for="if-${f}">${label}</label>
      <textarea class="if-in" id="if-${f}" data-field="${f}" rows="${rows}" maxlength="${max}" placeholder="${hint}">${esc(p[f] || "")}</textarea>`;
    return `<div class="if">
        <div class="if-main">
          <label class="if-l" for="if-label">Name</label><input class="if-in if-name" id="if-label" data-field="label" maxlength="60" value="${esc(p.label)}">
          ${field("objective", "The idea in one sentence", "What it is, in one sentence", 2, 600)}
          ${field("for_whom", "For whom", "Who would use it?", 1, 300)}
          ${field("problem", "Problem solved", "Which problem does it solve, and why now?", 3, 600)}
          ${field("notes", "Notes", "Everything else: features, business model, competitors, open questions… (free text, markdown welcome)", 12, 8000)}
          <span class="if-saved" id="if-saved"></span>
        </div>
        <aside class="if-side">
          ${S.start_status !== S.idea_status ? `<div class="blk"><div class="bh"><span class="bt">${ph("rocket-launch")}Take action</span></div>
            <p class="ov-p">When you start, the idea becomes a project (“${esc(next)}”) with its tasks and timeline.</p>
            <button class="go" data-launch>${ph("arrow-right")}Move to ${esc(next.toLowerCase())}</button></div>` : ""}
          <div class="blk"><div class="bh"><span class="bt">${ph("link")}Links</span><button class="lnk" data-add-link>+ add</button></div>
            ${p.links.length ? `<ul class="ov-links">${p.links.map(linkHTML).join("")}</ul>` : `<p class="empty">Inspiration, competitors, mock-ups…</p>`}</div>
          <div class="blk"><div class="bh"><span class="bt">${ph("lightbulb")}Quick notes</span><button class="lnk" data-tab="ideas">open</button></div>
            <p class="ov-p">${p.ideas.length ? `${plural(p.ideas.length, "quick note")} (Ideas tab).` : "Small loose ideas for this project go in the Ideas tab."}</p></div>
          <button class="lnk danger if-del" data-delete-project>${ph("trash")}Delete this idea</button>
        </aside>
      </div>`;
  }

  // Tasks (kanban)
  function visible(t) {
    if (filters.imp.size && !filters.imp.has(t.importance)) return false;
    if (filters.q) { const q = filters.q.toLowerCase(); if (!(t.title.toLowerCase().includes(q) || (t.tags || []).some(g => g.toLowerCase().includes(q)) || (t.notes || "").toLowerCase().includes(q))) return false; }
    return true;
  }
  function taskCard(t) {
    const dc = dueClass(t.due), isTop = t.importance === TOP() && IMP_IDS.length > 1, done = t.col === S.done_column;
    return `<article class="tk ${isTop ? "urgent" : ""}" data-task="${esc(t.id)}" style="--imp:${imp(t.importance).color}" tabindex="0">
      <div class="tk-t">${S.done_column ? `<button class="tk-ck" data-check="${esc(t.id)}" aria-pressed="${done}" title="${done ? "Reopen the task" : "Mark as done"}">${ph("check")}</button>` : ""}${isTop ? `<span class="tk-urg">${esc(imp(t.importance).label)}</span>` : ""}${esc(t.title)}</div>
      <div class="tk-m"><span class="imp-dot" title="Importance: ${esc(imp(t.importance).label)}"></span>${t.due ? `<span class="tk-due ${dc}">${ph("calendar-blank")}${fmtDate(t.due)}${dc === "late" ? " · late" : ""}</span>` : ""}${(t.tags || []).map(g => `<span class="tk-tag">${esc(g)}</span>`).join("")}${t.notes ? `<span class="tk-ic" title="Has notes">${ph("note")}</span>` : ""}${t.source === "session" ? `<span class="tk-ic" title="Added from a Claude session">${ph("terminal")}</span>` : t.source === "idea" ? `<span class="tk-ic" title="Comes from an idea">${ph("lightbulb")}</span>` : ""}</div>
    </article>`;
  }
  function tasksTab() {
    const p = cur;
    return `<div class="tk-bar">
        <div class="tk-search">${ph("magnifying-glass")}<input id="tk-q" type="search" placeholder="Filter (title, tag, notes)" value="${esc(filters.q)}"></div>
        <div class="tk-imp">${IMP_IDS.map(k => `<button data-imp="${esc(k)}" aria-pressed="${filters.imp.has(k)}" style="--imp:${imp(k).color}"><span class="imp-dot"></span>${esc(imp(k).label)}</button>`).join("")}</div>
        <span class="tk-legend">Drag cards between columns · click = edit</span>
      </div>
      <div class="kb" style="--ncols:${COLUMNS.length}">${COLUMNS.map(c => {
        let items = p.tasks.filter(t => t.col === c.id && visible(t));
        const total = items.length, isDone = c.id === S.done_column;
        if (isDone && !filters.showDone) items = items.slice(0, 5);
        return `<section class="kb-col c-${esc(c.id)}" data-col="${esc(c.id)}"><header><span>${esc(c.label)}</span><i>${total}</i><button class="kb-add" data-add="${esc(c.id)}" title="Add a task">${ph("plus")}</button></header>
          <div class="kb-new" data-new="${esc(c.id)}" hidden><textarea rows="2" placeholder="New task… (Enter to add, Esc to cancel)"></textarea></div>
          <div class="kb-list">${items.map(taskCard).join("") || `<p class="kb-empty">${esc(c.hint || "Empty")}</p>`}</div>
          ${isDone && total > 5 ? `<button class="lnk kb-more" data-toggle-done>${filters.showDone ? "show less" : `show all ${total} done`}</button>` : ""}</section>`;
      }).join("")}</div>`;
  }

  // Timeline
  function timelineTab() {
    const p = cur, today = todayISO();
    const items = [
      ...p.tasks.filter(t => t.due && t.col !== S.done_column).map(t => ({ date: t.due, label: t.title, kind: "task", t })),
      ...p.milestones.filter(m => m.date).map(m => ({ date: m.date, label: msLabel(m.label), kind: "ms", gate: m.gate })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const undated = p.tasks.filter(t => !t.due && t.col !== S.done_column).length;
    const last = items.length ? items[items.length - 1].date : today;
    const span = Math.max(30, Math.min(150, daysTo(last) + 7));
    const x = iso => Math.max(0, Math.min(100, 100 * daysTo(iso) / span));
    const ticks = []; for (let d = 0; d <= span; d += 7) { const dt = new Date(); dt.setDate(dt.getDate() + d); ticks.push({ x: 100 * d / span, label: dt.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }) }); }
    const group = it => { const n = daysTo(it.date); return n < 0 ? "Overdue" : n <= 6 ? "This week" : n <= 13 ? "Next week" : n <= 31 ? "This month" : "Later"; };
    const groups = []; items.forEach(it => { const g = group(it); if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, rows: [] }); groups[groups.length - 1].rows.push(it); });
    return `<div class="tl">
        <div class="tl-axis">${ticks.map(t => `<span class="tl-tick" style="left:${t.x}%"><i></i>${t.label}</span>`).join("")}
          <span class="tl-today" style="left:0">today</span>
          ${items.map(it => it.kind === "ms" ? `<span class="tl-ms" style="left:${x(it.date)}%" title="${esc(it.label)} · ${fmtDay(it.date)}"></span>`
            : `<span class="tl-dot ${daysTo(it.date) < 0 ? "late" : ""}" data-task="${esc(it.t.id)}" style="left:${x(it.date)}%;--imp:${imp(it.t.importance).color}" title="${esc(it.label)} · ${fmtDay(it.date)}"></span>`).join("")}
        </div>
        <div class="tl-leg"><span><i class="dia"></i>milestone (goals.json)</span>${IMP_IDS.map(k => `<span><i class="pdot" style="background:${imp(k).color}"></i>${esc(imp(k).label.toLowerCase())}</span>`).join("")}${undated ? `<button class="lnk" data-tab="tasks">${plural(undated, "task")} without a date</button>` : ""}</div>
        ${groups.length ? groups.map(g => `<h4 class="tl-g ${g.g === "Overdue" ? "late" : ""}">${g.g}</h4><ul class="tl-list">${g.rows.map(it => `<li class="${it.kind}" ${it.t ? `data-task="${esc(it.t.id)}"` : ""}>
            <span class="d">${fmtDay(it.date)}</span>${it.kind === "ms" ? `<i class="dia"></i>` : `<i class="pdot" style="background:${imp(it.t.importance).color}"></i>`}
            <span class="l">${it.kind === "ms" ? `<b>${esc(it.label)}</b>` : esc(it.label)}</span>
            ${it.t ? `<span class="col">${esc(colLabel(it.t.col))}</span>` : `<span class="col">milestone</span>`}<span class="j ${dueClass(it.date)}">${jx(daysTo(it.date))}</span></li>`).join("")}</ul>`).join("")
          : `<p class="empty">Nothing dated. Add a due date to a task (click the task → Due date), or a milestone in goals.json.</p>`}
      </div>`;
  }

  // Ideas
  function ideasTab() {
    const p = cur, open = p.ideas.filter(i => !i.task), used = p.ideas.filter(i => i.task), inbox = colLabel(S.inbox_column);
    const row = i => {
      const t = i.task && p.tasks.find(x => x.id === i.task);
      const src = i.source === "capture" ? "from Capture" : i.source === "dashboard" ? "added here" : esc(i.source || "");
      return `<li class="${i.task ? "used" : ""}"><div><p>${esc(i.text)}</p><small>${[i.created ? fmtFull(i.created) : "", src].filter(Boolean).join(" · ")}${t ? ` · became a task (${esc(colLabel(t.col))})` : i.task ? " · became a task (deleted since)" : ""}</small></div>
        <div class="id-act">${i.task ? (t ? `<button class="lnk" data-task="${esc(t.id)}">see the task</button>` : "") : `<button class="go" data-promote="${esc(i.id)}">${ph("arrow-right")}Task</button>`}<button class="lnk" data-del-idea="${esc(i.id)}" title="Delete the idea">×</button></div></li>`;
    };
    return `<div class="id-add"><textarea id="id-new" rows="2" placeholder="An idea for ${esc(p.label)}… (Enter to add)" maxlength="500"></textarea><button class="go" id="id-add">${ph("plus")}Add</button></div>
      <p class="id-hint">Ideas captured with Capture (filed in this project) arrive here by themselves. “→ Task” creates a task in “${esc(inbox)}”.</p>
      ${open.length ? `<ul class="id-list">${open.map(row).join("")}</ul>` : `<p class="empty">No idea waiting.</p>`}
      ${used.length ? `<details class="fin"><summary>Became tasks · ${used.length}</summary><ul class="id-list">${used.map(row).join("")}</ul></details>` : ""}`;
  }

  // Task editor (over the page)
  function editorHTML() {
    const t = cur.tasks.find(x => x.id === editing);
    if (!t) { editing = null; return ""; }
    const src = t.source === "session" ? "from a Claude session" : t.source === "idea" ? "from an idea" : t.source === "dashboard" ? "added in the dashboard" : "from the project file";
    return `<div class="te-back" data-close-editor><div class="te" role="dialog" aria-label="Edit the task" style="--imp:${imp(t.importance).color}">
      <div class="te-h"><span class="imp-dot"></span><span class="te-src">${src}${t.created ? " · " + fmtFull(t.created) : ""}</span><button class="mdp-x" data-close-editor title="Close (Esc)">×</button></div>
      <textarea class="te-title" rows="2" data-f="title" maxlength="300">${esc(t.title)}</textarea>
      <label class="te-l">Importance</label>
      <div class="te-imp">${IMP_IDS.map(k => `<button data-set-imp="${esc(k)}" aria-pressed="${t.importance === k}" style="--imp:${imp(k).color}"><span class="imp-dot"></span>${esc(imp(k).label)}</button>`).join("")}</div>
      <div class="te-row"><div><label class="te-l">Column</label><select data-f="col">${COLUMNS.map(c => `<option value="${esc(c.id)}" ${c.id === t.col ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div>
        <div><label class="te-l">Due date</label><div class="te-due"><input type="date" data-f="due" value="${esc(t.due)}">${t.due ? `<button class="lnk" data-clear-due>remove</button>` : ""}</div></div></div>
      <label class="te-l">Tags <small>(comma-separated)</small></label><input class="te-in" data-f="tags" value="${esc((t.tags || []).join(", "))}" placeholder="bug, launch, marketing">
      <label class="te-l">Notes</label><textarea class="te-notes" rows="4" data-f="notes" maxlength="4000" placeholder="Details, links, definition of done…">${esc(t.notes || "")}</textarea>
      <div class="te-f"><button class="lnk danger" data-del-task>Delete the task</button><span class="te-saved" id="te-saved"></span><button class="go" data-close-editor>Done</button></div>
    </div></div>`;
  }

  // ---------- project page interactions ----------
  function bindProject() {
    root.querySelectorAll("[data-go-board]").forEach(b => b.onclick = () => go(null));
    root.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => go(cur.id, b.dataset.tab));
    root.querySelector(".pv-status").onchange = e => op("set", { status: e.target.value }).then(ok => ok && toast(`Status: ${stLabel(e.target.value)}`));
    root.querySelectorAll("[data-task]").forEach(el => { if (!el.classList.contains("tk")) el.addEventListener("click", () => { editing = el.dataset.task; renderProject(); }); });
    // project text fields (next time, objective): edited in the right-side panel
    const FIELDS = {
      objective: { title: "Objective", label: "Project objective", rows: 5, placeholder: "What the project must achieve, in one or two sentences", hint: "Shown in the project overview." },
      next_time: { title: "Next time", label: "Next time: what do you want to start with?", rows: 4, placeholder: "e.g. finish the pricing page, then reply to the beta testers",
                   hint: "Filled in automatically when you say it in a session (“next time…”); you can edit it here." },
    };
    root.querySelectorAll("[data-edit-field]").forEach(el => el.addEventListener("click", e => {
      e.stopPropagation();
      const f = el.dataset.editField, d = FIELDS[f];
      window.openFormPanel({ title: d.title, subtitle: cur.label, fields: [{ key: f, label: d.label, rows: d.rows, placeholder: d.placeholder, hint: d.hint, value: cur[f] || "" }],
        onSubmit: v => op("set", { [f]: v[f] }) });
    }));
    root.querySelectorAll("[data-add-link]").forEach(b => b.onclick = () => window.openFormPanel({
      title: "Add a link", subtitle: cur.label, submit: "Add",
      fields: [{ key: "url", label: "Address or file", placeholder: "site.com/page, https://…, localhost:3000, ~/Documents/…", hint: "A website (with or without https://), a local server, or the path of a file." },
               { key: "label", label: "Label (optional)", placeholder: "e.g. Admin" }],
      onSubmit: async v => {
        let url = v.url; if (!url) throw new Error("missing address");
        if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(url)) url = "http://" + url;
        else if (!/^(https?:\/\/|\/|~\/)/i.test(url) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(url)) url = "https://" + url;
        const label = v.label || (/^https?:\/\//i.test(url) ? url.replace(/^https?:\/\//i, "").replace(/\/$/, "") : url.split("/").filter(Boolean).pop());
        return op("set", { links: [...cur.links, { label, url }] });
      } }));
    root.querySelectorAll("[data-del-link]").forEach(b => b.onclick = () => op("set", { links: cur.links.filter((_, i) => i !== +b.dataset.delLink) }));
    root.querySelectorAll("[data-open-path]").forEach(a => a.onclick = async e => {
      e.preventDefault();
      const pth = a.dataset.openPath;
      if (/\.(md|txt)$/i.test(pth) && window.openMdPreview) return window.openMdPreview(null, pth.split("/").pop(), pth);
      try {
        const r = await fetch("/open", { method: "POST", headers: { "X-Dashboard": "1", "Content-Type": "application/json" }, body: JSON.stringify({ path: pth }) });
        if (!r.ok) throw new Error(r.status === 403 ? "outside your search folders, or not found" : r.status);
      } catch (err) { toast(`Cannot open: ${err.message}`, true); }
    });
    const pick = root.querySelector("#pv-color");
    if (pick) {
      pick.addEventListener("input", () => { root.querySelector(".pv").style.setProperty("--c", pick.value); window.setProjectColor(cur.id, pick.value, false); });
      pick.addEventListener("change", () => { window.setProjectColor(cur.id, pick.value, true); toast("Colour saved: brain, tags and cards follow"); });
    }
    root.querySelector("[data-rename]")?.addEventListener("click", () => window.openFormPanel({
      title: "Rename the project", subtitle: cur.label,
      fields: [{ key: "label", label: "Name", value: cur.label, placeholder: "Project name" }],
      onSubmit: v => { if (!v.label) throw new Error("the name cannot be empty"); return op("set", { label: v.label }); } }));
    root.querySelectorAll(".if-in").forEach(el => el.addEventListener("change", async () => {
      const f = el.dataset.field, v = el.value;
      if (f === "label" && !v.trim()) { el.value = cur.label; return; }
      try {
        cur = await api(`/projects/${cur.id}`, { op: "set", args: { [f]: f === "label" ? v.trim() : v } });  // no redraw: keep the cursor
        if (f === "label") root.querySelector("#pv-name").textContent = cur.label;
        const s = root.querySelector("#if-saved"); s.textContent = "saved ✓"; clearTimeout(s.t); s.t = setTimeout(() => s.textContent = "", 1500);
      } catch (e) { toast(`Not saved: ${e.message}`, true); }
    }));
    root.querySelector("[data-launch]")?.addEventListener("click", () => op("set", { status: S.start_status }).then(ok => ok && toast(`${cur.label} → ${stLabel(S.start_status)}`)));
    root.querySelector("[data-delete-project]")?.addEventListener("click", async () => {
      if (!confirm(`Delete “${cur.label}”? (recoverable from state/projects-deleted/)`)) return;
      try { await api(`/projects/${cur.id}`, { op: "delete_project" }); toast("Idea deleted"); go(null); } catch (e) { toast(e.message, true); }
    });
    if (view.tab === "tasks") bindTasks();
    if (view.tab === "ideas") bindIdeas();
    if (editing) bindEditor();
  }

  function bindTasks() {
    const q = root.querySelector("#tk-q");
    q.oninput = () => { filters.q = q.value; const pos = q.selectionStart; renderProject(); const n = root.querySelector("#tk-q"); n.focus(); n.setSelectionRange(pos, pos); };
    root.querySelectorAll("[data-imp]").forEach(b => b.onclick = () => { const k = b.dataset.imp; filters.imp.has(k) ? filters.imp.delete(k) : filters.imp.add(k); renderProject(); });
    root.querySelectorAll("[data-toggle-done]").forEach(b => b.onclick = () => { filters.showDone = !filters.showDone; renderProject(); });
    // quick add
    root.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
      const box = root.querySelector(`[data-new="${CSS.escape(b.dataset.add)}"]`); box.hidden = false; box.querySelector("textarea").focus();
    });
    root.querySelectorAll("[data-new] textarea").forEach(ta => ta.addEventListener("keydown", async e => {
      if (e.key === "Escape") { e.stopPropagation(); ta.value = ""; ta.parentElement.hidden = true; }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const title = ta.value.trim(), col = ta.parentElement.dataset.new; if (!title || busy) return;
        busy = true; await op("task_add", { title, col }); busy = false;
        const again = root.querySelector(`[data-new="${CSS.escape(col)}"]`); if (again) { again.hidden = false; again.querySelector("textarea").focus(); }
      }
    }));
    // cards: click = edit, drag = move
    root.querySelectorAll(".tk").forEach(el => {
      el.addEventListener("click", () => { if (suppressClick) return; editing = el.dataset.task; renderProject(); });
      el.addEventListener("keydown", e => { if (e.key === "Enter") { editing = el.dataset.task; renderProject(); } });
    });
    root.querySelectorAll("[data-check]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const done = b.getAttribute("aria-pressed") === "true";
      op("task_move", { tid: b.dataset.check, col: done ? S.new_column : S.done_column, index: 0 });
    }));
    dragAndDrop([...root.querySelectorAll(".tk")], [...root.querySelectorAll(".kb-col")], (el, col, before) => {
      const tid = el.dataset.task, ids = [...col.querySelectorAll(".kb-list > .tk")].map(c => c.dataset.task).filter(x => x !== tid);
      op("task_move", { tid, col: col.dataset.col, index: before ? ids.indexOf(before.dataset.task) : ids.length });
    });
  }

  function bindIdeas() {
    const ta = root.querySelector("#id-new");
    const add = async () => { const text = ta.value.trim(); if (!text) return; if (await op("idea_add", { text })) root.querySelector("#id-new").focus(); };
    root.querySelector("#id-add").onclick = add;
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } });
    root.querySelectorAll("[data-promote]").forEach(b => b.onclick = () => op("idea_promote", { iid: b.dataset.promote }).then(ok => ok && toast(`Idea added to the tasks, in “${colLabel(S.inbox_column)}”`)));
    root.querySelectorAll("[data-del-idea]").forEach(b => b.onclick = () => { if (confirm("Delete this idea?")) op("idea_delete", { iid: b.dataset.delIdea }); });
  }

  function bindEditor() {
    const tid = editing;
    const saved = () => { const s = root.querySelector("#te-saved"); if (s) { s.textContent = "saved ✓"; clearTimeout(saved.t); saved.t = setTimeout(() => { s.textContent = ""; }, 1500); } };
    const update = async fields => { if (await op("task_update", { tid, fields })) saved(); };
    root.querySelectorAll("[data-close-editor]").forEach(el => el.addEventListener("click", e => { if (e.target === el) { editing = null; renderProject(); } }));
    root.querySelectorAll("[data-set-imp]").forEach(b => b.onclick = () => update({ importance: b.dataset.setImp }));
    root.querySelector(".te [data-f=col]").onchange = e => update({ col: e.target.value });
    root.querySelector(".te [data-f=due]").onchange = e => update({ due: e.target.value });
    root.querySelector("[data-clear-due]")?.addEventListener("click", () => update({ due: "" }));
    const text = (sel, fn) => { const el = root.querySelector(sel); el.addEventListener("change", () => fn(el.value)); };
    text(".te [data-f=title]", v => v.trim() && update({ title: v.trim() }));
    text(".te [data-f=tags]", v => update({ tags: v.split(",").map(x => x.trim()).filter(Boolean).slice(0, 8) }));
    text(".te [data-f=notes]", v => update({ notes: v }));
    root.querySelector("[data-del-task]").onclick = async () => { if (confirm("Delete this task?")) { editing = null; await op("task_delete", { tid }); } };
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && editing && document.getElementById("mdp")?.hidden !== false) {
      const a = document.activeElement; if (a && a.matches(".te input, .te textarea, .te select")) a.blur();
      editing = null; renderProject();
    }
  });
  window.addEventListener("areacolors", () => {
    if (root.hidden || document.activeElement?.id === "pv-color") return;
    view.pid ? (cur && renderProject()) : list.length && renderBoard();
  });

  // page opened directly (#projects…) before this file was loaded: app.js could not hand it over yet
  (window.OS_CONFIG_READY || Promise.resolve()).then(() => setTimeout(() => {
    if (!shown && !root.hidden && location.hash.startsWith("#projects")) window.ProjectsUI.show(location.hash.slice(1).split("/").slice(1).join("/"));
  }, 0));

  // gentle refresh (sessions, captures) when nothing is being edited
  setInterval(() => {
    if (root.hidden || editing || !location.hash.startsWith("#projects")) return;
    if (document.activeElement?.closest?.("#projpage") && document.activeElement.matches("input,textarea,select")) return;
    if (document.body.classList.contains("is-dragging")) return;
    view.pid ? api(`/projects/${view.pid}`).then(p => { cur = p; renderProject(); }).catch(() => {}) : openBoard();
  }, 60000);
})();
