/* Math Garden — parent dashboard: progress, error patterns, settings, players. */
(function () {
  const app = document.getElementById("app");
  const $ = (s) => app.querySelector(s);
  const P = { kids: [], tab: null, range: 30, data: null };
  const DAY = 86400000;

  // ---------- tooltip ----------
  const tip = document.getElementById("tip");
  function showTip(e) {
    const t = e.target.closest("[data-tip]");
    if (!t) return tip.classList.add("hidden");
    tip.innerHTML = t.dataset.tip;
    tip.classList.remove("hidden");
    const pt = e.touches ? e.touches[0] : e;
    const x = Math.min(pt.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px";
    tip.style.top = pt.clientY + 16 + "px";
  }
  document.addEventListener("mousemove", showTip);
  document.addEventListener("touchstart", showTip, { passive: true });

  // ---------- boot / auth ----------
  async function boot() {
    await K.store.init();
    const sess = await K.store.session();
    if (!sess) return showLogin();
    await loadKids();
    render();
  }
  async function loadKids() {
    P.kids = (await K.store.listKids()).map((k) => ({ ...k, settings: K.withDefaults(k.settings) }));
    if (!P.tab || (P.tab !== "players" && !P.kids.find((k) => k.id === P.tab))) P.tab = P.kids[0]?.id || "players";
  }

  function showLogin(err) {
    app.innerHTML = `
      <div class="wrap"><div class="panel login">
        <h3>🌼 Math Garden · Parent sign-in</h3>
        <p class="desc">Use the email and password you created in Supabase.</p>
        <form id="lf" class="grid">
          <div class="field"><label>Email</label><input type="email" id="em" autocomplete="username" required></div>
          <div class="field"><label>Password</label><input type="password" id="pw" autocomplete="current-password" required></div>
          ${err ? `<div style="color:#b3261e">${K.esc(err)}</div>` : ""}
          <button class="pbtn" type="submit">Sign in</button>
        </form>
      </div></div>`;
    $("#lf").onsubmit = async (e) => {
      e.preventDefault();
      try { await K.store.signIn($("#em").value, $("#pw").value); boot(); }
      catch (ex) { showLogin(ex.message || "Sign-in failed"); }
    };
  }

  // ---------- frame ----------
  function render() {
    const kid = P.kids.find((k) => k.id === P.tab);
    app.innerHTML = `
      <div class="wrap">
        <div class="top">
          <h1>🌼 Math Garden · Parent</h1>
          <div class="spacer"></div>
          <a class="pbtn ghost" href="index.html" style="text-decoration:none">Open kid view</a>
          ${K.store.mode === "cloud" ? `<button class="pbtn ghost" id="out">Sign out</button>` : ""}
        </div>
        ${K.store.mode === "demo" ? `<div class="banner"><b>Demo mode:</b> data is saved only in this browser. Add your Supabase details to <code>config.js</code> (see SETUP.md) so both iPads and this dashboard share one database.</div>` : ""}
        <div class="tabs">
          ${P.kids.map((k) => `<button data-tab="${k.id}" class="${P.tab === k.id ? "on" : ""}">${k.avatar} ${K.esc(k.name)}</button>`).join("")}
          <button data-tab="players" class="${P.tab === "players" ? "on" : ""}">⚙️ Players</button>
        </div>
        <div id="body"></div>
      </div>`;
    app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { P.tab = b.dataset.tab; render(); }));
    if ($("#out")) $("#out").onclick = async () => { await K.store.signOut(); showLogin(); };
    if (kid) renderKid(kid); else renderPlayers();
  }

  // ---------- analytics ----------
  function analyze(puzzles, attempts) {
    const parts = new Map();
    for (const a of attempts) {
      const key = `${a.puzzle_id}|${a.part}|${a.part_index}`;
      if (!parts.has(key)) parts.set(key, []);
      parts.get(key).push(a);
    }
    const partRows = [...parts.values()].map((list) => {
      list.sort((x, y) => (x.at < y.at ? -1 : 1));
      const f = list[0];
      return {
        day: K.localDay(f.at), kind: f.part, target: f.target, addends: f.addends, crosses: f.crosses_ten,
        firstTry: f.correct, solved: list.some((a) => a.correct), misses: list.filter((a) => !a.correct).length,
      };
    });
    const errors = attempts.filter((a) => !a.correct);
    const done = puzzles.filter((p) => p.completed);
    return { puzzles, done, attempts, errors, partRows };
  }
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);
  const acc = (rows) => pct(rows.filter((r) => r.firstTry).length, rows.length);
  const fmtDur = (ms) => { if (ms == null) return "–"; const t = Math.round(ms / 1000); return t < 60 ? `${t}s` : `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, "0")}s`; };
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fact = (ad) => `${Math.max(...ad)} + ${Math.min(...ad)}`;

  function insights(A, kid) {
    const out = [];
    const { partRows, errors, done } = A;
    if (!partRows.length) return out;
    // Most common error type
    if (errors.length >= 3) {
      const counts = {};
      errors.forEach((e) => (counts[e.error_type] = (counts[e.error_type] || 0) + 1));
      const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const T = K.ERROR_TYPES[top];
      if (top !== "guess") out.push(`<b>Most common miss: ${T.label}</b> (${pct(n, errors.length)}% of mistakes). ${T.tip}`);
    }
    // Facts that keep tripping them up
    const missedFacts = {};
    partRows.filter((r) => !r.firstTry).forEach((r) => { const f = fact(r.addends); missedFacts[f] = (missedFacts[f] || 0) + 1; });
    const tough = Object.entries(missedFacts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (tough.length) out.push(`<b>Facts to practice:</b> ${tough.map(([f, n]) => `${f} (missed ${n}×)`).join(", ")}.`);
    // Crossing ten
    const cx = partRows.filter((r) => r.crosses), nc = partRows.filter((r) => !r.crosses);
    if (cx.length >= 5 && nc.length >= 5 && acc(nc) - acc(cx) >= 15)
      out.push(`<b>Crossing 10 is harder</b> (${acc(cx)}% vs ${acc(nc)}% first-try). Practice “make ten” pairs (8 + 2, 7 + 3), then bridging: 8 + 5 = 8 + 2 + 3.`);
    // Hints
    if (done.length >= 5) {
      const h = done.filter((p) => p.hints > 0).length;
      if (h / done.length >= 0.4) out.push(`<b>Hints appeared in ${pct(h, done.length)}% of puzzles.</b> Consider an easier level for a while to rebuild confidence.`);
    }
    // Trend: first half vs second half
    const days = [...new Set(partRows.map((r) => r.day))].sort();
    if (days.length >= 4) {
      const mid = days[Math.floor(days.length / 2)];
      const a1 = acc(partRows.filter((r) => r.day < mid)), a2 = acc(partRows.filter((r) => r.day >= mid));
      if (a2 - a1 >= 8) out.push(`<b>Improving:</b> first-try accuracy rose from ${a1}% to ${a2}% over this period.`);
      else if (a1 - a2 >= 8) out.push(`<b>Dipping:</b> first-try accuracy fell from ${a1}% to ${a2}%. Could be a recent level change, or tiredness.`);
    }
    // Ready to level up
    const recent = partRows.slice(-40);
    if (done.length >= 10 && acc(recent) >= 90) {
      const i = K.PRESETS.findIndex((p) => p.name === K.levelName(kid.settings));
      const next = K.PRESETS[i + 1];
      out.push(`<b>Ready for more?</b> ${acc(recent)}% first-try on recent puzzles.${next ? ` Try the <b>${next.name}</b> level (${next.note}).` : ""}`);
    }
    return out;
  }

  // ---------- charts ----------
  function dailyChart(A) {
    const nDays = Math.min(P.range, 30);
    const W = 640, H = 200, pad = { l: 36, r: 8, t: 10, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const days = [];
    for (let i = nDays - 1; i >= 0; i--) days.push(K.localDay(Date.now() - i * DAY));
    const bw = iw / nDays;
    const y = (v) => pad.t + ih - (v / 100) * ih;
    let g = "";
    [0, 50, 100].forEach((v) => {
      g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#ece6db" stroke-width="1"/>
            <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#7d878b">${v}%</text>`;
    });
    days.forEach((d, i) => {
      const rows = A.partRows.filter((r) => r.day === d);
      const puzzles = A.done.filter((p) => K.localDay(p.started_at) === d);
      const mins = Math.round(A.puzzles.filter((p) => K.localDay(p.started_at) === d).reduce((s, p) => s + p.duration_ms, 0) / 60000);
      const v = acc(rows);
      const x = pad.l + i * bw;
      const label = new Date(d + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const tipTxt = v == null ? `${label}: no play` : `<b>${label}</b><br>${v}% first-try · ${puzzles.length} puzzle${puzzles.length === 1 ? "" : "s"} · ${mins} min`;
      g += `<g class="bar-col" data-tip="${K.esc(tipTxt)}"><rect x="${x}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent"/>`;
      if (v != null) {
        const top = y(v), bx = x + bw * 0.18, w = bw * 0.64, h = pad.t + ih - top;
        const r = Math.min(4, w / 2, h);
        g += `<path class="b" fill="var(--accent)" d="M${bx},${pad.t + ih} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + w - r} Q${bx + w},${top} ${bx + w},${top + r} V${pad.t + ih} Z"/>`;
      }
      g += `</g>`;
      if (i % Math.ceil(nDays / 7) === 0 || i === nDays - 1)
        g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#7d878b">${label}</text>`;
    });
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="#cfc7b9"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Daily first-try accuracy">${g}</svg>`;
  }

  function hbars(rows, { asPct = false } = {}) {
    if (!rows.length) return `<div class="empty">No data yet</div>`;
    const max = asPct ? 100 : Math.max(...rows.map((r) => r.value));
    return rows.map((r) => `
      <div class="hbar" data-tip="${K.esc(r.tip || "")}">
        <span>${r.label}</span>
        <span class="track"><span class="fill" style="width:${max ? (r.value / max) * 100 : 0}%"></span></span>
        <span class="v">${r.display}</span>
      </div>`).join("");
  }

  // ---------- kid page ----------
  async function renderKid(kid) {
    const body = $("#body");
    body.innerHTML = `<div class="empty">Loading…</div>`;
    const since = P.range === 0 ? "1970-01-01T00:00:00Z" : new Date(Date.now() - P.range * DAY).toISOString();
    let raw;
    try { raw = await K.store.fetchHistory(kid.id, since); }
    catch (e) { body.innerHTML = `<div class="banner">Couldn't load data: ${K.esc(e.message)}</div>`; return; }
    const A = analyze(raw.puzzles, raw.attempts);
    P.data = A;
    const practiceTimes = A.done.filter((p) => p.mode === "practice").map((p) => p.duration_ms);
    const raceTimes = A.done.filter((p) => p.mode === "race").map((p) => p.duration_ms);
    const totalMs = A.puzzles.reduce((s, p) => s + (p.duration_ms || 0), 0);
    const daysPlayed = new Set(A.puzzles.map((p) => K.localDay(p.started_at))).size;
    const firstTry = acc(A.partRows);
    const hintsPer = A.done.length ? (A.done.reduce((s, p) => s + p.hints, 0) / A.done.length).toFixed(1) : "–";

    // error types
    const ec = {};
    A.errors.forEach((e) => (ec[e.error_type] = (ec[e.error_type] || 0) + 1));
    const errRows = Object.entries(ec).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({
      label: K.ERROR_TYPES[t]?.label || t, value: n, display: `${n} · ${pct(n, A.errors.length)}%`, tip: K.ERROR_TYPES[t]?.tip,
    }));
    // accuracy by problem type
    const groups = [
      ["Crossing 10 (e.g. 8 + 5)", (r) => r.crosses],
      ["No crossing (e.g. 3 + 4)", (r) => !r.crosses],
      ["Sums ≤ 10", (r) => r.target <= 10],
      ["Sums 11–20", (r) => r.target > 10 && r.target <= 20],
      ["Sums 21–50", (r) => r.target > 20 && r.target <= 50],
      ["Sums 51–100", (r) => r.target > 50],
      ["Middle flower", (r) => r.kind === "center"],
    ];
    const typeRows = groups.map(([label, f]) => {
      const rs = A.partRows.filter(f);
      const v = acc(rs);
      return rs.length ? { label, value: v, display: `${v}% <small>(${rs.length})</small>`, tip: `${v}% solved on the first tap across ${rs.length} problems` } : null;
    }).filter(Boolean);

    const ins = insights(A, kid);
    const errLog = [...A.errors].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 150);

    body.innerHTML = `
      <div class="top">
        <div class="seg" id="range">
          ${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]].map(([v, l]) => `<button data-r="${v}" class="${P.range === v ? "on" : ""}">${l}</button>`).join("")}
        </div>
        <div class="spacer"></div>
        <span class="tag">Level: ${K.levelName(kid.settings)} · ${K.levelLabel(kid.settings)}</span>
        <button class="pbtn ghost" id="csv">Export CSV</button>
      </div>
      <div class="grid tiles">
        <div class="tile"><div class="lab">Puzzles finished</div><div class="val">${A.done.length}</div><div class="sub">${A.puzzles.length - A.done.length} left unfinished</div></div>
        <div class="tile"><div class="lab">First-try accuracy</div><div class="val">${firstTry == null ? "–" : firstTry + "%"}</div><div class="sub">across ${A.partRows.length} problems</div></div>
        <div class="tile"><div class="lab">Typical puzzle time</div><div class="val">${fmtDur(median(practiceTimes))}</div><div class="sub">practice median · race best ${fmtDur(raceTimes.length ? Math.min(...raceTimes) : null)}</div></div>
        <div class="tile"><div class="lab">Time played</div><div class="val">${Math.round(totalMs / 60000)} min</div><div class="sub">on ${daysPlayed} day${daysPlayed === 1 ? "" : "s"}</div></div>
        <div class="tile"><div class="lab">Hints per puzzle</div><div class="val">${hintsPer}</div><div class="sub">a hint shows after 2 misses</div></div>
      </div>
      <div class="panel" style="margin-bottom:14px">
        <h3>What to work on</h3>
        ${ins.length ? `<ul class="insights">${ins.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<div class="empty">Not enough play yet to spot patterns. Check back after a few sessions.</div>`}
      </div>
      <div class="grid two">
        <div class="panel"><h3>First-try accuracy by day</h3><p class="desc">Share of problems solved on the first tap. Hover a day for details.</p>${dailyChart(A)}</div>
        <div class="panel"><h3>Types of mistakes</h3><p class="desc">${A.errors.length} wrong taps. Hover a row for what it means.</p>${hbars(errRows)}</div>
      </div>
      <div class="grid two">
        <div class="panel"><h3>Accuracy by problem type</h3><p class="desc">First-try accuracy (number of problems).</p>${hbars(typeRows, { asPct: true })}</div>
        <div class="panel" id="settings"></div>
      </div>
      <div class="panel">
        <h3>Error log</h3><p class="desc">Most recent first (up to 150).</p>
        ${errLog.length ? `<div class="tablewrap"><table>
          <thead><tr><th>When</th><th>Numbers shown</th><th>Answer</th><th>Tapped</th><th>Type</th><th>Time</th></tr></thead>
          <tbody>${errLog.map((e) => `<tr>
            <td>${new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
            <td class="mono">${e.numbers.join(", ")}${e.part === "center" ? " <span class='tag'>middle</span>" : ""}</td>
            <td class="mono">${fact(e.addends)} = ${e.target}</td>
            <td class="mono"><b>${e.picked}</b></td>
            <td><span class="tag">${K.ERROR_TYPES[e.error_type]?.label || e.error_type}</span></td>
            <td class="mono">${(e.ms / 1000).toFixed(1)}s</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No mistakes logged in this period 🎉</div>`}
      </div>`;
    body.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { P.range = +b.dataset.r; renderKid(kid); }));
    $("#csv").onclick = () => exportCsv(kid, A);
    renderSettings(kid);
  }

  // ---------- settings ----------
  function renderSettings(kid) {
    const el = $("#settings");
    const s = { ...kid.settings };
    const draw = () => {
      const opt = (vals, cur) => vals.map((v) => `<option value="${v}" ${v === cur ? "selected" : ""}>${v}</option>`).join("");
      el.innerHTML = `
        <h3>Difficulty & settings</h3>
        <p class="desc">Changes apply on ${K.esc(kid.name)}'s next puzzle (reopen the app if it's already open).</p>
        <div class="presets">${K.PRESETS.map((p, i) => `<button class="preset ${K.levelName(s) === p.name ? "on" : ""}" data-p="${i}"><b>${p.name}</b><span>${p.note}</span></button>`).join("")}</div>
        <div class="form">
          <div class="field"><label>Biggest sum</label><select id="max_sum">${opt([10, 20, 50, 100], s.max_sum)}</select></div>
          <div class="field"><label>Petals per puzzle</label><select id="petals">${opt([3, 4, 5], s.petals)}</select></div>
          <div class="field"><label>Numbers per petal</label><select id="per_petal">${opt([4, 5], s.per_petal)}</select></div>
          <div class="field"><label>Daily limit (minutes, 0 = unlimited)</label><input type="number" min="0" max="240" id="daily_minutes" value="${s.daily_minutes}"></div>
          <label class="check"><input type="checkbox" id="center_round" ${s.center_round ? "checked" : ""}> Middle-flower round</label>
          <label class="check"><input type="checkbox" id="allow_cross_ten" ${s.allow_cross_ten ? "checked" : ""}> Allow crossing 10 (8 + 5)</label>
          <label class="check"><input type="checkbox" id="race_allowed" ${s.race_allowed ? "checked" : ""}> Race mode available</label>
          <label class="check"><input type="checkbox" id="voice" ${s.voice ? "checked" : ""}> Spoken prompts</label>
        </div>
        <div style="margin-top:14px"><button class="pbtn" id="save">Save settings</button><span class="saved hidden" id="ok">Saved ✓</span></div>`;
      el.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { Object.assign(s, K.PRESETS[+b.dataset.p].s); draw(); }));
      el.querySelectorAll("select").forEach((x) => (x.onchange = () => { s[x.id] = +x.value; draw(); }));
      el.querySelectorAll("input[type=checkbox]").forEach((x) => (x.onchange = () => { s[x.id] = x.checked; draw(); }));
      el.querySelector("#daily_minutes").onchange = (e) => { s.daily_minutes = Math.max(0, +e.target.value || 0); };
      el.querySelector("#save").onclick = async () => {
        try {
          await K.store.upsertKid({ id: kid.id, name: kid.name, avatar: kid.avatar, color: kid.color, sort: kid.sort ?? 0, settings: s });
          kid.settings = { ...s };
          el.querySelector("#ok").classList.remove("hidden");
        } catch (e) { alert("Couldn't save: " + e.message); }
      };
    };
    draw();
  }

  // ---------- players ----------
  function renderPlayers() {
    const body = $("#body");
    const rows = [...P.kids, { id: null, name: "", avatar: K.AVATARS[P.kids.length % K.AVATARS.length], color: K.COLORS[P.kids.length % K.COLORS.length], sort: P.kids.length, settings: K.withDefaults() }];
    body.innerHTML = `<div class="panel">
      <h3>Players</h3><p class="desc">First names or nicknames only. Each iPad remembers its player after the first tap.</p>
      ${rows.map((k, i) => `
        <div class="kidrow" data-i="${i}">
          <div class="form">
            <div class="field"><label>${k.id ? "Name" : "Add a new player"}</label><input type="text" class="nm" maxlength="20" value="${K.esc(k.name)}" placeholder="Name"></div>
            <div class="field"><label>Color</label><div class="colpick">${K.COLORS.map((c) => `<button style="background:${c}" data-c="${c}" class="${c === k.color ? "on" : ""}" aria-label="color"></button>`).join("")}</div></div>
          </div>
          <div class="field"><label>Avatar</label><div class="avpick">${K.AVATARS.map((a) => `<button data-a="${a}" class="${a === k.avatar ? "on" : ""}">${a}</button>`).join("")}</div></div>
          <div><button class="pbtn sv">${k.id ? "Save" : "Add player"}</button> ${k.id ? `<button class="pbtn danger del">Delete</button>` : ""}</div>
        </div>`).join("")}
    </div>`;
    body.querySelectorAll(".kidrow").forEach((row) => {
      const k = { ...rows[+row.dataset.i] };
      row.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { k.avatar = b.dataset.a; row.querySelectorAll("[data-a]").forEach((x) => x.classList.toggle("on", x === b)); }));
      row.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { k.color = b.dataset.c; row.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("on", x === b)); }));
      row.querySelector(".sv").onclick = async () => {
        k.name = row.querySelector(".nm").value.trim();
        if (!k.name) return alert("Please enter a name");
        const rec = { name: k.name, avatar: k.avatar, color: k.color, sort: k.sort ?? 0, settings: k.settings };
        if (k.id) rec.id = k.id;
        try { await K.store.upsertKid(rec); await loadKids(); render(); }
        catch (e) { alert("Couldn't save: " + e.message); }
      };
      const del = row.querySelector(".del");
      if (del) del.onclick = async () => {
        if (!confirm(`Delete ${k.name} and all of their history? This can't be undone.`)) return;
        try { await K.store.deleteKid(k.id); await loadKids(); P.tab = "players"; render(); }
        catch (e) { alert("Couldn't delete: " + e.message); }
      };
    });
  }

  // ---------- export ----------
  function exportCsv(kid, A) {
    const cols = ["at", "mode", "part", "part_index", "numbers", "target", "addends", "picked", "correct", "error_type", "ms", "crosses_ten", "hint_shown", "puzzle_id"];
    const modeOf = Object.fromEntries(A.puzzles.map((p) => [p.id, p.mode]));
    const lines = [cols.join(",")].concat(A.attempts.map((a) => cols.map((c) => {
      let v = c === "mode" ? modeOf[a.puzzle_id] : a[c];
      if (Array.isArray(v)) v = v.join(" ");
      return `"${String(v ?? "").replace(/"/g, '""')}"`;
    }).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `math-garden-${kid.name.toLowerCase()}-${K.localDay(Date.now())}.csv`;
    a.click();
  }

  boot().catch((e) => { app.innerHTML = `<div class="wrap"><div class="banner">Something went wrong: ${K.esc(e.message)}</div></div>`; });
})();
