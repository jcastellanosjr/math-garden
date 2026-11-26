/* Math Garden — parent dashboard: overview, Math / Spelling / Reading analytics, settings, players. */
(function () {
  const app = document.getElementById("app");
  const $ = (s) => app.querySelector(s);
  const P = { kids: [], tab: null, sub: "math", range: 30 };
  const DAY = 86400000;
  const MATH_GAMES = ["kakooma_add", "math_quick"];
  const SPELL_GAMES = ["word_build", "word_pick"];
  const READ_GAMES = ["read_pick"];
  const GAME_LABEL = { kakooma_add: "Flower Math", math_quick: "Boss", word_build: "Spell It", word_pick: "Boss", read_pick: "Read It", boss: "Boss" };

  // ---------- tooltip ----------
  const tip = document.getElementById("tip");
  function showTip(e) {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t || !t.dataset.tip) return tip.classList.add("hidden");
    tip.innerHTML = t.dataset.tip;
    tip.classList.remove("hidden");
    const pt = e.touches ? e.touches[0] : e;
    tip.style.left = Math.min(pt.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + "px";
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
          <h1>🌼 Math Garden · Parent</h1><div class="spacer"></div>
          <a class="pbtn ghost" href="index.html" style="text-decoration:none">Open kid view</a>
          ${K.store.mode === "cloud" ? `<button class="pbtn ghost" id="out">Sign out</button>` : ""}
        </div>
        ${K.store.mode === "demo" ? `<div class="banner"><b>Demo mode:</b> data is saved only in this browser. Add your Supabase details to <code>config.js</code> (see SETUP.md).</div>` : ""}
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

  // ---------- helpers ----------
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);
  const acc = (rows) => pct(rows.filter((r) => r.firstTry).length, rows.length);
  const fmtDur = (ms) => { if (ms == null) return "–"; const t = Math.round(ms / 1000); return t < 60 ? `${t}s` : `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, "0")}s`; };
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fact = (ad) => `${Math.max(...ad)} + ${Math.min(...ad)}`;
  const errLabel = (t) => K.ERROR_TYPES[t]?.label || t || "–";
  const when = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // Group taps into "items" (one petal, one word, one question). First tap decides first-try accuracy.
  function itemsOf(attempts) {
    const m = new Map();
    for (const a of attempts) {
      const key = `${a.puzzle_id}|${a.part}|${a.part_index}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(a);
    }
    return [...m.values()].map((list) => {
      list.sort((x, y) => (x.at < y.at ? -1 : 1));
      const f = list[0];
      return { ...f, day: K.localDay(f.at), firstTry: f.correct, misses: list.filter((a) => !a.correct).length };
    });
  }

  function commonInsights(errors, items) {
    const out = [];
    if (errors.length >= 3) {
      const counts = {};
      errors.forEach((e) => (counts[e.error_type] = (counts[e.error_type] || 0) + 1));
      const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const T = K.ERROR_TYPES[top];
      if (T && top !== "guess") out.push(`<b>Most common miss: ${T.label}</b> (${pct(n, errors.length)}% of mistakes). ${T.tip}`);
    }
    const days = [...new Set(items.map((r) => r.day))].sort();
    if (days.length >= 4) {
      const mid = days[Math.floor(days.length / 2)];
      const a1 = acc(items.filter((r) => r.day < mid)), a2 = acc(items.filter((r) => r.day >= mid));
      if (a2 - a1 >= 8) out.push(`<b>Improving:</b> first-try accuracy rose from ${a1}% to ${a2}% over this period.`);
      else if (a1 - a2 >= 8) out.push(`<b>Dipping:</b> first-try accuracy fell from ${a1}% to ${a2}%. Could be a recent level change, or tiredness.`);
    }
    return out;
  }
  function missedOften(items, keyOf, label) {
    const c = {};
    items.filter((r) => !r.firstTry).forEach((r) => { const k = keyOf(r); c[k] = (c[k] || 0) + 1; });
    const tough = Object.entries(c).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return tough.length ? `<b>${label}:</b> ${tough.map(([f, n]) => `${K.esc(f)} (missed ${n}×)`).join(", ")}.` : null;
  }

  // ---------- charts ----------
  function dailyChart(items, puzzles) {
    const nDays = P.range === 7 ? 7 : 30;
    const W = 640, H = 200, pad = { l: 36, r: 8, t: 10, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const days = [];
    for (let i = nDays - 1; i >= 0; i--) days.push(K.localDay(Date.now() - i * DAY));
    const bw = iw / nDays, y = (v) => pad.t + ih - (v / 100) * ih;
    let g = "";
    [0, 50, 100].forEach((v) => {
      g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#ece6db"/>
            <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#7d878b">${v}%</text>`;
    });
    days.forEach((d, i) => {
      const rows = items.filter((r) => r.day === d);
      const mins = Math.round(puzzles.filter((p) => K.localDay(p.started_at) === d).reduce((s, p) => s + p.duration_ms, 0) / 60000);
      const v = acc(rows), x = pad.l + i * bw;
      const label = new Date(d + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const t = v == null ? `${label}: no play` : `<b>${label}</b><br>${v}% first-try · ${rows.length} item${rows.length === 1 ? "" : "s"} · ${mins} min`;
      g += `<g class="bar-col" data-tip="${K.esc(t)}"><rect x="${x}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent"/>`;
      if (v != null) {
        const top = y(v), bx = x + bw * 0.18, w = bw * 0.64, r = Math.min(4, w / 2, pad.t + ih - top);
        g += `<path class="b" fill="var(--accent)" d="M${bx},${pad.t + ih} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + w - r} Q${bx + w},${top} ${bx + w},${top + r} V${pad.t + ih} Z"/>`;
      }
      g += `</g>`;
      if (i % Math.ceil(nDays / 7) === 0 || i === nDays - 1) g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#7d878b">${label}</text>`;
    });
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="#cfc7b9"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Daily first-try accuracy">${g}</svg>`;
  }
  function hbars(rows) {
    if (!rows.length) return `<div class="empty">No data yet</div>`;
    const max = Math.max(...rows.map((r) => r.max ?? r.value), 1);
    return rows.map((r) => `
      <div class="hbar" data-tip="${K.esc(r.tip || "")}">
        <span>${r.label}</span>
        <span class="track"><span class="fill" style="width:${(r.value / (r.max ?? max)) * 100}%"></span></span>
        <span class="v">${r.display}</span>
      </div>`).join("");
  }
  const errorBars = (errors) => {
    const ec = {};
    errors.forEach((e) => (ec[e.error_type] = (ec[e.error_type] || 0) + 1));
    return hbars(Object.entries(ec).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ label: errLabel(t), value: n, display: `${n} · ${pct(n, errors.length)}%`, tip: K.ERROR_TYPES[t]?.tip })));
  };
  const accBars = (groups, items) => hbars(groups.map(([label, f]) => {
    const rs = items.filter(f), v = acc(rs);
    return rs.length ? { label, value: v, max: 100, display: `${v}% <small>(${rs.length})</small>`, tip: `${v}% right on the first try across ${rs.length}` } : null;
  }).filter(Boolean));
  const tile = (lab, val, sub) => `<div class="tile"><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
  const insightsPanel = (ins) => `<div class="panel" style="margin-bottom:14px"><h3>What to work on</h3>
    ${ins.length ? `<ul class="insights">${ins.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<div class="empty">Not enough play yet to spot patterns. Check back after a few sessions.</div>`}</div>`;
  function errorLog(errors, cols) {
    const rows = [...errors].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 150);
    if (!rows.length) return `<div class="panel"><h3>Error log</h3><div class="empty">No mistakes logged in this period 🎉</div></div>`;
    return `<div class="panel"><h3>Error log</h3><p class="desc">Most recent first (up to 150).</p><div class="tablewrap"><table>
      <thead><tr><th>When</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}<th>Type</th><th>Time</th></tr></thead>
      <tbody>${rows.map((e) => `<tr><td>${when(e.at)}</td>${cols.map((c) => `<td class="mono">${c[1](e)}</td>`).join("")}
        <td><span class="tag">${errLabel(e.error_type)}</span></td><td class="mono">${(e.ms / 1000).toFixed(1)}s</td></tr>`).join("")}</tbody></table></div></div>`;
  }

  // ---------- kid page ----------
  async function renderKid(kid) {
    const body = $("#body");
    body.innerHTML = `<div class="empty">Loading…</div>`;
    const since = P.range === 0 ? "1970-01-01T00:00:00Z" : new Date(Date.now() - P.range * DAY).toISOString();
    let raw, st;
    try { [raw, st] = await Promise.all([K.store.fetchHistory(kid.id, since), K.store.getState(kid.id).catch(() => null)]); }
    catch (e) { body.innerHTML = `<div class="banner">Couldn't load data: ${K.esc(e.message)}. If you just updated the app, make sure you ran upgrade-v2.sql in Supabase.</div>`; return; }
    raw.attempts.forEach((a) => (a.game = a.game || "kakooma_add"));
    const done = raw.puzzles.filter((p) => p.completed);
    const totalMs = raw.puzzles.reduce((s, p) => s + (p.duration_ms || 0), 0);
    const daysPlayed = new Set(raw.puzzles.map((p) => K.localDay(p.started_at))).size;
    const W = st ? K.worldOf(st.world || 0) : null;
    const lap = st ? Math.floor((st.world || 0) / K.WORLDS.length) + 1 : 1;
    const bossesWon = done.filter((p) => p.game === "boss").length;

    body.innerHTML = `
      <div class="top">
        <div class="seg">${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]].map(([v, l]) => `<button data-r="${v}" class="${P.range === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="spacer"></div>
        <button class="pbtn ghost" id="csv">Export CSV</button>
      </div>
      <div class="grid tiles">
        ${tile("Rounds finished", done.length, `${raw.puzzles.length - done.length} left unfinished`)}
        ${tile("Time played", `${Math.round(totalMs / 60000)} min`, `on ${daysPlayed} day${daysPlayed === 1 ? "" : "s"}`)}
        ${tile("Adventure", W ? `${W.boss.icon} ${(st.stop || 0) + 1}/8` : "–", W ? `${W.name}${lap > 1 ? ` · lap ${lap}` : ""}` : "Not started yet")}
        ${tile("Bosses cheered up", bossesWon, st ? `${(st.friends || []).length} friends total` : "in this period")}
        ${tile("Stars earned", done.reduce((s, p) => s + p.stars, 0), "in this period")}
      </div>
      <div class="subtabs">
        ${[["math", "🔢 Math"], ["spell", "🔤 Spelling"], ["read", "📚 Reading"], ["settings", "⚙️ Settings"]].map(([k, l]) => `<button data-sub="${k}" class="${P.sub === k ? "on" : ""}">${l}</button>`).join("")}
      </div>
      <div id="subbody"></div>`;
    body.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { P.range = +b.dataset.r; renderKid(kid); }));
    body.querySelectorAll("[data-sub]").forEach((b) => (b.onclick = () => { P.sub = b.dataset.sub; renderKid(kid); }));
    $("#csv").onclick = () => exportCsv(kid, raw);
    const sb = $("#subbody");
    if (P.sub === "math") sb.innerHTML = mathView(kid, raw);
    else if (P.sub === "spell") sb.innerHTML = spellView(kid, raw);
    else if (P.sub === "read") sb.innerHTML = readView(kid, raw);
    else renderSettings(kid, st, sb);
  }

  // ----- math -----
  function mathView(kid, raw) {
    const attempts = raw.attempts.filter((a) => MATH_GAMES.includes(a.game));
    const puzzles = raw.puzzles.filter((p) => p.game === "kakooma_add");
    const items = itemsOf(attempts);
    const errors = attempts.filter((a) => !a.correct);
    const done = puzzles.filter((p) => p.completed);
    const practice = done.filter((p) => p.mode === "practice").map((p) => p.duration_ms);
    const race = done.filter((p) => p.mode === "race").map((p) => p.duration_ms);
    const ins = commonInsights(errors, items);
    const f = missedOften(items, (r) => fact(r.addends), "Facts to practice"); if (f) ins.splice(1, 0, f);
    const cx = items.filter((r) => r.crosses_ten), nc = items.filter((r) => !r.crosses_ten);
    if (cx.length >= 5 && nc.length >= 5 && acc(nc) - acc(cx) >= 15)
      ins.push(`<b>Crossing 10 is harder</b> (${acc(cx)}% vs ${acc(nc)}% first-try). Practice “make ten” pairs (8 + 2, 7 + 3), then bridging: 8 + 5 = 8 + 2 + 3.`);
    if (done.length >= 5) { const h = done.filter((p) => p.hints > 0).length; if (h / done.length >= 0.4) ins.push(`<b>Hints appeared in ${pct(h, done.length)}% of puzzles.</b> Consider an easier level for a while.`); }
    if (done.length >= 10 && acc(items.slice(-40)) >= 90) {
      const i = K.PRESETS.findIndex((p) => p.name === K.levelName(kid.settings)), next = K.PRESETS[i + 1];
      ins.push(`<b>Ready for more?</b> ${acc(items.slice(-40))}% first-try recently.${next ? ` Try the <b>${next.name}</b> level (${next.note}).` : ""}`);
    }
    return `
      <div class="grid tiles">
        ${tile("Math level", K.levelName(kid.settings), K.levelLabel(kid.settings))}
        ${tile("First-try accuracy", acc(items) == null ? "–" : acc(items) + "%", `across ${items.length} problems`)}
        ${tile("Typical puzzle time", fmtDur(median(practice)), `race best ${fmtDur(race.length ? Math.min(...race) : null)}`)}
        ${tile("Hints per puzzle", done.length ? (done.reduce((s, p) => s + p.hints, 0) / done.length).toFixed(1) : "–", "a hint shows after 2 misses")}
      </div>
      ${insightsPanel(ins)}
      <div class="grid two">
        <div class="panel"><h3>First-try accuracy by day</h3><p class="desc">Hover a day for details.</p>${dailyChart(items, puzzles)}</div>
        <div class="panel"><h3>Types of mistakes</h3><p class="desc">${errors.length} wrong taps. Hover a row for what it means.</p>${errorBars(errors)}</div>
      </div>
      <div class="grid two">
        <div class="panel"><h3>Accuracy by problem type</h3><p class="desc">First-try accuracy (number of problems).</p>${accBars([
          ["Crossing 10 (e.g. 8 + 5)", (r) => r.crosses_ten], ["No crossing (e.g. 3 + 4)", (r) => !r.crosses_ten],
          ["Sums ≤ 10", (r) => r.target <= 10], ["Sums 11–20", (r) => r.target > 10 && r.target <= 20],
          ["Sums 21–50", (r) => r.target > 20 && r.target <= 50], ["Sums 51–100", (r) => r.target > 50],
          ["Middle flower", (r) => r.part === "center"], ["Boss questions", (r) => r.game === "math_quick"]], items)}</div>
        <div class="panel"><h3>Where mistakes happen</h3><p class="desc">Flower Math vs. boss battles.</p>${accBars([["Flower Math", (r) => r.game === "kakooma_add"], ["Boss battles", (r) => r.game === "math_quick"]], items)}</div>
      </div>
      ${errorLog(errors, [["Shown", (e) => e.numbers ? e.numbers.join(", ") + (e.game === "math_quick" ? " <span class='tag'>boss</span>" : e.part === "center" ? " <span class='tag'>middle</span>" : "") : ""],
        ["Answer", (e) => (e.addends ? `${fact(e.addends)} = ${e.target}` : "")], ["Tapped", (e) => `<b>${e.picked}</b>`]])}`;
  }

  // ----- spelling -----
  function spellView(kid, raw) {
    const attempts = raw.attempts.filter((a) => SPELL_GAMES.includes(a.game));
    const puzzles = raw.puzzles.filter((p) => p.game === "word_build");
    const items = itemsOf(attempts);
    const errors = attempts.filter((a) => !a.correct);
    const L = K.WORD_LEVELS[kid.settings.word_level];
    const ins = commonInsights(errors, items);
    const w = missedOften(items, (r) => r.item, "Words to practice"); if (w) ins.splice(1, 0, w);
    const byLevel = K.WORD_LEVELS.map((lv) => [lv, items.filter((r) => r.skill === lv.key)]).filter(([, rs]) => rs.length >= 6);
    const weak = byLevel.filter(([, rs]) => acc(rs) < 70).sort((a, b) => acc(a[1]) - acc(b[1]))[0];
    if (weak) ins.push(`<b>Hardest pattern: ${weak[0].name}</b> (${acc(weak[1])}% first-try). Practice a family of words like ${weak[0].eg}.`);
    const cur = items.filter((r) => r.skill === L.key).slice(-25);
    if (cur.length >= 20 && acc(cur) >= 90) {
      const next = K.WORD_LEVELS[kid.settings.word_level + 1];
      ins.push(`<b>Ready for more?</b> ${acc(cur)}% first-try on ${L.name}.${next ? ` Try <b>${next.name}</b> (${next.eg}) in Settings.` : ""}`);
    }
    return `
      <div class="grid tiles">
        ${tile("Spelling level", K.esc(L.name), K.esc(L.eg))}
        ${tile("First-try accuracy", acc(items) == null ? "–" : acc(items) + "%", `across ${items.length} words`)}
        ${tile("Spell It rounds", puzzles.filter((p) => p.completed).length, "5 words each")}
        ${tile("Help letters used", puzzles.reduce((s, p) => s + p.hints, 0), "shown after 2 tries")}
      </div>
      ${insightsPanel(ins)}
      <div class="grid two">
        <div class="panel"><h3>First-try accuracy by day</h3><p class="desc">Words spelled right on the first try.</p>${dailyChart(items, puzzles)}</div>
        <div class="panel"><h3>Types of mistakes</h3><p class="desc">${errors.length} wrong spellings. Hover a row for a teaching tip.</p>${errorBars(errors)}</div>
      </div>
      <div class="grid two">
        <div class="panel"><h3>Accuracy by spelling pattern</h3><p class="desc">First-try accuracy (number of words).</p>${accBars(K.WORD_LEVELS.map((lv) => [K.esc(lv.name), (r) => r.skill === lv.key]), items)}</div>
        <div class="panel"><h3>Where mistakes happen</h3><p class="desc">Building a word vs. picking the right spelling in boss battles.</p>${accBars([["Spell It (build the word)", (r) => r.game === "word_build"], ["Boss (pick the spelling)", (r) => r.game === "word_pick"]], items)}</div>
      </div>
      ${errorLog(errors, [["Word", (e) => `${K.esc(e.answer || e.item)}${e.game === "word_pick" ? " <span class='tag'>boss</span>" : ""}`], ["They wrote", (e) => `<b>${K.esc(e.response)}</b>`], ["Pattern", (e) => K.esc(K.skillName(e.skill))]])}`;
  }

  // ----- reading -----
  function readView(kid, raw) {
    const attempts = raw.attempts.filter((a) => READ_GAMES.includes(a.game));
    const puzzles = raw.puzzles.filter((p) => p.game === "read_pick");
    const items = itemsOf(attempts);
    const errors = attempts.filter((a) => !a.correct);
    const kindOf = (r) => (r.skill || "").split(":")[0];
    const tierOf = (r) => +(r.skill || "0:0").split(":")[1];
    const ins = commonInsights(errors, items);
    const ri = items.filter((r) => kindOf(r) === "riddle"), ga = items.filter((r) => kindOf(r) === "gap");
    if (ri.length >= 6 && ga.length >= 6 && Math.abs(acc(ri) - acc(ga)) >= 15)
      ins.push(acc(ri) < acc(ga) ? `<b>Clue riddles are harder</b> (${acc(ri)}% vs ${acc(ga)}%). This is about holding several facts in mind — read riddle books together and ask “what else do we know?”`
        : `<b>Missing-word sentences are harder</b> (${acc(ga)}% vs ${acc(ri)}%). Encourage reading the full sentence aloud with each choice.`);
    const quick = attempts.filter((a) => a.ms < 2500).length;
    if (attempts.length >= 15 && quick / attempts.length > 0.4) ins.push(`<b>Answering very fast:</b> ${pct(quick, attempts.length)}% of taps came in under 2.5 seconds — faster than most kids can read the sentence. Encourage reading first, then tapping.`);
    const cur = items.filter((r) => tierOf(r) === kid.settings.read_tier).slice(-20);
    if (cur.length >= 16 && acc(cur) >= 90 && kid.settings.read_tier < 2) ins.push(`<b>Ready for more?</b> ${acc(cur)}% first-try. Try <b>${K.READ_TIERS[kid.settings.read_tier + 1]}</b> in Settings.`);
    const readMs = items.filter((r) => r.firstTry).map((r) => r.ms);
    return `
      <div class="grid tiles">
        ${tile("Reading level", K.READ_TIERS[kid.settings.read_tier], "riddles + missing words")}
        ${tile("First-try accuracy", acc(items) == null ? "–" : acc(items) + "%", `across ${items.length} questions`)}
        ${tile("Typical reading time", fmtDur(median(readMs)), "per question, when right")}
        ${tile("Read It rounds", puzzles.filter((p) => p.completed).length, "4 questions each")}
      </div>
      ${insightsPanel(ins)}
      <div class="grid two">
        <div class="panel"><h3>First-try accuracy by day</h3><p class="desc">Questions answered right on the first try.</p>${dailyChart(items, puzzles)}</div>
        <div class="panel"><h3>Types of mistakes</h3><p class="desc">${errors.length} wrong taps. Hover a row for a teaching tip.</p>${errorBars(errors)}</div>
      </div>
      <div class="grid two">
        <div class="panel"><h3>Accuracy by question type</h3><p class="desc">First-try accuracy (number of questions).</p>${accBars([
          ["Clue riddles", (r) => kindOf(r) === "riddle"], ["Missing word", (r) => kindOf(r) === "gap"],
          ...K.READ_TIERS.map((t, i) => [t, (r) => tierOf(r) === i])], items)}</div>
        <div class="panel"><h3>Where mistakes happen</h3><p class="desc">Read It rounds vs. boss battles.</p>${accBars([["Read It", (r) => r.part === "read"], ["Boss battles", (r) => r.part === "boss"]], items)}</div>
      </div>
      ${errorLog(errors, [["Sentence", (e) => `<span style="white-space:normal">${K.esc(e.item)}</span>`], ["Answer", (e) => K.esc(e.answer || "")], ["They picked", (e) => `<b>${K.esc(e.response)}</b>`]])}`;
  }

  // ---------- settings ----------
  function renderSettings(kid, st, el) {
    const s = { ...kid.settings };
    const draw = () => {
      const opt = (vals, cur, lab = (v) => v) => vals.map((v) => `<option value="${v}" ${v === cur ? "selected" : ""}>${lab(v)}</option>`).join("");
      const W = st ? K.worldOf(st.world || 0) : null;
      el.innerHTML = `
        <div class="grid two">
          <div class="panel">
            <h3>🔢 Math</h3><p class="desc">Used by Flower Math and the math questions in boss battles.</p>
            <div class="presets">${K.PRESETS.map((p, i) => `<button class="preset ${K.levelName(s) === p.name ? "on" : ""}" data-p="${i}"><b>${p.name}</b><span>${p.note}</span></button>`).join("")}</div>
            <div class="form">
              <div class="field"><label>Biggest sum</label><select data-n="max_sum">${opt([10, 20, 50, 100], s.max_sum)}</select></div>
              <div class="field"><label>Petals per puzzle</label><select data-n="petals">${opt([3, 4, 5], s.petals)}</select></div>
              <div class="field"><label>Numbers per petal</label><select data-n="per_petal">${opt([4, 5], s.per_petal)}</select></div>
              <label class="check"><input type="checkbox" data-b="center_round" ${s.center_round ? "checked" : ""}> Middle-flower round</label>
              <label class="check"><input type="checkbox" data-b="allow_cross_ten" ${s.allow_cross_ten ? "checked" : ""}> Allow crossing 10 (8 + 5)</label>
              <label class="check"><input type="checkbox" data-b="race_allowed" ${s.race_allowed ? "checked" : ""}> Race mode in Practice</label>
            </div>
          </div>
          <div class="panel">
            <h3>📖 Words & reading</h3><p class="desc">Spell It uses the spelling level; Read It uses the reading level. Boss battles use both.</p>
            <div class="form">
              <div class="field" style="grid-column:1/-1"><label>Spelling level</label><select data-n="word_level">${opt(K.WORD_LEVELS.map((_, i) => i), s.word_level, (i) => `${i + 1}. ${K.WORD_LEVELS[i].name} — ${K.WORD_LEVELS[i].eg}`)}</select></div>
              <div class="field" style="grid-column:1/-1"><label>Reading level</label><select data-n="read_tier">${opt([0, 1, 2], s.read_tier, (i) => K.READ_TIERS[i])}</select></div>
              <div class="field" style="grid-column:1/-1"><label>Adventure mix: <b>${s.word_mix}% words</b> · ${100 - s.word_mix}% math</label>
                <input type="range" min="0" max="100" step="10" value="${s.word_mix}" data-n="word_mix" style="width:100%"></div>
            </div>
            <h3 style="margin-top:18px">General</h3>
            <div class="form">
              <div class="field"><label>Daily limit (minutes, 0 = unlimited)</label><input type="number" min="0" max="240" data-n="daily_minutes" value="${s.daily_minutes}"></div>
              <label class="check"><input type="checkbox" data-b="voice" ${s.voice ? "checked" : ""}> Spoken prompts</label>
            </div>
          </div>
        </div>
        <div style="margin:4px 0 18px"><button class="pbtn" id="save">Save settings</button><span class="saved hidden" id="ok">Saved ✓ — applies next time ${K.esc(kid.name)} opens the app</span></div>
        <div class="panel">
          <h3>🗺️ Adventure</h3>
          ${st && st.buddy ? `<p class="desc">${K.esc(kid.name)}'s buddy is <b>${st.buddy.animal} ${K.esc(st.buddy.name)}</b>. Currently in <b>${W.name}</b>, stop ${(st.stop || 0) + 1} of 8. Friends: ${(st.friends || []).map((w) => K.WORLDS[w % 4].boss.friend).join(" ") || "none yet"}. Skills: 🔦 ${st.skills?.lantern ?? 0} · ⏭️ ${st.skills?.hop ?? 0}.</p>
            <button class="pbtn danger" id="reset">Restart adventure from World 1</button> <span class="desc">Keeps the buddy, hats, friends, stars and all history.</span>`
          : `<p class="desc">${K.esc(kid.name)} hasn't made a buddy yet — that happens the first time they open the new version.</p>`}
        </div>`;
      el.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { Object.assign(s, K.PRESETS[+b.dataset.p].s); draw(); }));
      el.querySelectorAll("select[data-n]").forEach((x) => (x.onchange = () => { s[x.dataset.n] = +x.value; draw(); }));
      el.querySelectorAll("input[data-b]").forEach((x) => (x.onchange = () => { s[x.dataset.b] = x.checked; draw(); }));
      el.querySelector('[data-n="word_mix"]').oninput = (e) => { s.word_mix = +e.target.value; e.target.previousElementSibling.innerHTML = `Adventure mix: <b>${s.word_mix}% words</b> · ${100 - s.word_mix}% math`; };
      el.querySelector('[data-n="daily_minutes"]').onchange = (e) => { s.daily_minutes = Math.max(0, +e.target.value || 0); };
      el.querySelector("#save").onclick = async () => {
        try {
          await K.store.upsertKid({ id: kid.id, name: kid.name, avatar: kid.avatar, color: kid.color, sort: kid.sort ?? 0, settings: s });
          kid.settings = { ...s };
          el.querySelector("#ok").classList.remove("hidden");
        } catch (e) { alert("Couldn't save: " + e.message); }
      };
      const rs = el.querySelector("#reset");
      if (rs) rs.onclick = async () => {
        if (!confirm(`Send ${kid.name} back to the start of World 1? Their buddy, hats, friends and history are kept.`)) return;
        st.world = 0; st.stop = 0; st.updated = new Date().toISOString();
        try { localStorage.removeItem("kakooma.state." + kid.id); } catch {}
        await K.store.saveState(kid.id, st);
        draw();
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
        try { await K.store.upsertKid(rec); await loadKids(); render(); } catch (e) { alert("Couldn't save: " + e.message); }
      };
      const del = row.querySelector(".del");
      if (del) del.onclick = async () => {
        if (!confirm(`Delete ${k.name} and all of their history? This can't be undone.`)) return;
        try { await K.store.deleteKid(k.id); await loadKids(); P.tab = "players"; render(); } catch (e) { alert("Couldn't delete: " + e.message); }
      };
    });
  }

  // ---------- export ----------
  function exportCsv(kid, raw) {
    const cols = ["at", "game", "mode", "part", "part_index", "item", "answer", "response", "numbers", "target", "addends", "picked", "correct", "error_type", "skill", "ms", "crosses_ten", "hint_shown", "puzzle_id"];
    const modeOf = Object.fromEntries(raw.puzzles.map((p) => [p.id, p.mode]));
    const lines = [cols.join(",")].concat(raw.attempts.map((a) => cols.map((c) => {
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
