/* Math Garden — kid experience: player picker, home page, Kakooma game. */
(function () {
  const app = document.getElementById("app");
  const $ = (sel) => app.querySelector(sel);
  const S = { kids: [], kid: null, summary: null, mode: "practice", game: null, introSpoken: false };
  const DEVICE_KID = "kakooma.kidId";

  // ================= boot =================
  async function boot() {
    try {
      await K.store.init();
      S.kids = await K.store.listKids();
    } catch (e) {
      console.error(e);
      S.kids = JSON.parse(localStorage.getItem("kakooma.kidsCache") || "[]"); // offline fallback
    }
    const kid = S.kids.find((k) => k.id === localStorage.getItem(DEVICE_KID));
    kid ? openKid(kid) : showPicker();
  }

  // ================= picker =================
  function showPicker() {
    stopGame();
    app.innerHTML = `
      <div class="screen picker">
        <h1>🌼 Math Garden</h1>
        <p>Who's playing?</p>
        <div class="kid-tiles">
          ${S.kids.map((k) => `<button class="kid-tile" data-kid="${k.id}" style="border-color:${k.color}"><span class="av">${k.avatar}</span>${K.esc(k.name)}</button>`).join("")}
        </div>
        ${S.kids.length ? "" : `<p>Ask a grown-up to add players on the Parent page.</p>`}
        <div class="footer-links"><a class="link" href="parent.html">Parent page</a></div>
      </div>`;
    app.querySelectorAll("[data-kid]").forEach((b) =>
      b.addEventListener("click", () => {
        const kid = S.kids.find((k) => k.id === b.dataset.kid);
        localStorage.setItem(DEVICE_KID, kid.id); // this iPad now opens straight to this kid
        openKid(kid);
      })
    );
  }

  // ================= home =================
  async function openKid(kid) {
    S.kid = kid;
    S.kid.settings = K.withDefaults(kid.settings);
    document.documentElement.style.setProperty("--kid", kid.color || "#2a9d8f");
    K.voiceOn = S.kid.settings.voice && localStorage.getItem("kakooma.mute") !== "1";
    if (!S.kid.settings.race_allowed) S.mode = "practice";
    try { S.summary = await K.store.kidSummary(kid.id); }
    catch (e) { console.error(e); S.summary = S.summary || { stars: 0, puzzles: 0, today_ms: 0, days: [], bests: {} }; }
    showHome();
  }

  function limitReached() {
    const lim = S.kid.settings.daily_minutes;
    return lim > 0 && S.summary.today_ms >= lim * 60000;
  }

  function showHome() {
    stopGame();
    const k = S.kid, s = k.settings, sum = S.summary;
    const plants = Math.floor(sum.stars / K.STARS_PER_PLANT);
    const toNext = sum.stars % K.STARS_PER_PLANT;
    const streak = K.streak(sum.days || []);
    const plantIcons = Array.from({ length: plants }, (_, i) => K.PLANTS[i % K.PLANTS.length]).join("");
    app.innerHTML = `
      <div class="screen home">
        <div class="home-head">
          <div class="av">${k.avatar}</div>
          <div><h1>Hi, ${K.esc(k.name)}!</h1><div class="sub">${K.levelName(s)} level · ${K.levelLabel(s)}</div></div>
          <div class="spacer"></div>
          <button class="iconbtn ${K.voiceOn ? "" : "off"}" id="mute" aria-label="Sound on or off">${K.voiceOn ? "🔊" : "🔈"}</button>
        </div>
        <div class="stats">
          <span class="pill">⭐ ${sum.stars} stars</span>
          <span class="pill">🧩 ${sum.puzzles} puzzles</span>
          <span class="pill">📅 ${streak} day${streak === 1 ? "" : "s"} in a row</span>
        </div>
        <div class="garden">
          <h2>My garden</h2>
          <div class="garden-plants">${plantIcons || `<span class="garden-empty">Earn ${K.STARS_PER_PLANT} stars to grow your first plant!</span>`}</div>
          <div class="grow">🌱 Next plant <div class="grow-bar"><i style="width:${(toNext / K.STARS_PER_PLANT) * 100}%"></i></div> ${toNext} / ${K.STARS_PER_PLANT} ⭐</div>
        </div>
        ${limitReached()
          ? `<div class="rest">🌙 Great work today!<br>Come back tomorrow to play again.</div>`
          : `
          ${s.race_allowed ? `
          <div class="mode-toggle">
            <button data-mode="practice" class="${S.mode === "practice" ? "on" : ""}">🌿 Practice</button>
            <button data-mode="race" class="${S.mode === "race" ? "on" : ""}">🏁 Race</button>
          </div>` : ""}
          <button class="btn big" id="play">▶ Play</button>`}
        <div class="footer-links"><button class="link" id="switch">Not ${K.esc(k.name)}? Change player</button></div>
      </div>`;
    $("#mute").onclick = () => {
      K.voiceOn = !K.voiceOn;
      localStorage.setItem("kakooma.mute", K.voiceOn ? "0" : "1");
      if (K.voiceOn) K.speak("Sound on");
      showHome();
    };
    $("#switch").onclick = () => { localStorage.removeItem(DEVICE_KID); showPicker(); };
    app.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
      S.mode = b.dataset.mode;
      K.speak(S.mode === "race" ? "Race mode. Go as fast as you can!" : "Practice mode. Take your time.");
      showHome();
    }));
    const play = $("#play");
    if (play) play.onclick = startGame;
  }

  // ================= game =================
  function startGame() {
    if (limitReached()) return showHome();
    const puzzle = K.generatePuzzle(S.kid.settings);
    const parts = puzzle.petals.map((p, i) => ({ kind: "petal", idx: i, ...p, solved: false, wrong: [], mistakes: 0, hint: false }));
    const center = puzzle.center ? { kind: "center", idx: 0, ...puzzle.center, solved: false, wrong: [], mistakes: 0, hint: false, active: false } : null;
    const now = performance.now();
    S.game = {
      id: K.uuid(), puzzle, parts, center, mode: S.mode,
      startedAt: new Date().toISOString(),
      activeMs: 0, resumedAt: now, lastTapAt: now, paused: false,
      attempts: [], mistakes: 0, hints: 0, finished: false, saved: false, timerId: null,
    };
    renderGame();
    if (S.mode === "race") S.game.timerId = setInterval(updateTimer, 250);
    if (!S.introSpoken) {
      K.speak("In each flower petal, find two numbers that add up to another number. Tap the answer!");
      S.introSpoken = true;
    }
  }

  const elapsed = (g) => g.activeMs + (g.paused ? 0 : performance.now() - g.resumedAt);
  const fmt = (ms) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  function updateTimer() { const el = $("#timer"); if (el && S.game) el.textContent = "⏱ " + fmt(elapsed(S.game)); }

  document.addEventListener("visibilitychange", () => {
    const g = S.game;
    if (!g || g.finished) return;
    if (document.hidden && !g.paused) { g.activeMs += performance.now() - g.resumedAt; g.paused = true; saveGame(false); }
    else if (!document.hidden && g.paused) { g.resumedAt = performance.now(); g.lastTapAt = performance.now(); g.paused = false; }
  });

  function layout() {
    const w = Math.min(window.innerWidth - 24, 760);
    const h = window.innerHeight - 170;
    const size = Math.max(300, Math.min(w, h));
    return { size, R: size * 0.335, petalD: size * 0.33, centerD: size * 0.3, btn: size * 0.33 * 0.27 };
  }

  function renderGame() {
    const g = S.game, s = g.puzzle.settings;
    const L = layout();
    const c = L.size / 2, n = g.parts.length;
    const ring = (cx, cy, r, count, i) => {
      const a = (-90 + (360 / count) * i) * (Math.PI / 180);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const fs = Math.round(L.btn * (s.max_sum >= 100 ? 0.4 : 0.46));
    const numBtn = (part, v, x, y) => {
      const cls = ["num"];
      if (part.solved) cls.push(v === part.target ? "right" : "fade");
      else if (part.wrong.includes(v)) cls.push("wrong");
      if (!part.solved && part.hint && part.addends.includes(v)) cls.push("hint");
      return `<button class="${cls.join(" ")}" data-part="${part.kind}${part.idx}" data-v="${v}"
        style="left:${x}px;top:${y}px;width:${L.btn}px;height:${L.btn}px;font-size:${fs}px">${v}</button>`;
    };
    let html = "";
    g.parts.forEach((p, i) => {
      const [px, py] = ring(c, c, L.R, n, i);
      html += `<div class="petal ${p.solved ? "solved" : ""}" style="left:${px - L.petalD / 2}px;top:${py - L.petalD / 2}px;width:${L.petalD}px;height:${L.petalD}px"></div>`;
      p.numbers.forEach((v, j) => {
        const [x, y] = ring(px, py, L.petalD * 0.3, p.numbers.length, j);
        html += numBtn(p, v, x, y);
      });
    });
    // center
    const cc = g.center;
    const cState = cc ? (cc.solved ? "solved" : cc.active ? "active" : "") : "";
    html += `<div class="center ${cState}" style="left:${c - L.centerD / 2}px;top:${c - L.centerD / 2}px;width:${L.centerD}px;height:${L.centerD}px">
      ${cc ? "" : `<span class="progress">🌸 ${g.parts.filter((p) => p.solved).length} / ${n}</span>`}</div>`;
    if (cc) {
      cc.numbers.forEach((v, j) => {
        const [x, y] = ring(c, c, L.centerD * 0.29, cc.numbers.length, j);
        if (cc.active || cc.solved) html += numBtn(cc, v, x, y);
        else {
          const filled = g.parts[j].solved;
          html += `<div class="num slot ${filled ? "filled" : ""}" style="left:${x}px;top:${y}px;width:${L.btn}px;height:${L.btn}px;font-size:${fs}px">${filled ? v : "?"}</div>`;
        }
      });
    }
    const centerMsg = cc && cc.active && !cc.solved;
    app.innerHTML = `
      <div class="screen game">
        <div class="game-top">
          <button class="iconbtn" id="home" aria-label="Home">🏠</button>
          <span class="pill">${S.kid.avatar} ${K.esc(S.kid.name)}</span>
          <div class="spacer"></div>
          ${g.mode === "race" ? `<span class="pill timer" id="timer">⏱ ${fmt(elapsed(g))}</span>` : `<span class="pill">🌿 Practice</span>`}
          <button class="iconbtn ${K.voiceOn ? "" : "off"}" id="mute" aria-label="Sound">${K.voiceOn ? "🔊" : "🔈"}</button>
        </div>
        <div class="howto">
          <span class="eg">🔍 ${centerMsg ? "Middle!" : "3 + 4 = <u>7</u>"}</span>
          <span class="txt">${centerMsg ? "Now the middle flower! Find the sum and tap it! 👆" : "Find 2 numbers that make a 3rd number. Tap the answer! 👆"}</span>
          <button class="iconbtn" id="say" aria-label="Read it to me">💬</button>
        </div>
        <div class="stage" style="width:${L.size}px;height:${L.size}px">${html}</div>
      </div>`;
    $("#home").onclick = () => { saveGame(false); openKid(S.kid); };
    $("#say").onclick = () => K.speak(centerMsg
      ? "Now the middle flower. Find two numbers that add up to another number, and tap it."
      : "In each petal, find two numbers that add up to another number. Tap the answer!");
    $("#mute").onclick = () => { K.voiceOn = !K.voiceOn; localStorage.setItem("kakooma.mute", K.voiceOn ? "0" : "1"); renderGame(); };
    app.querySelectorAll(".num[data-part]").forEach((b) => b.addEventListener("click", () => tap(b.dataset.part, +b.dataset.v)));
  }

  function flash(partKey, v, cls) {
    const el = app.querySelector(`.num[data-part="${partKey}"][data-v="${v}"]`);
    if (el) { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 450); }
  }

  function tap(partKey, v) {
    const g = S.game;
    if (!g || g.finished) return;
    const part = partKey.startsWith("center") ? g.center : g.parts[+partKey.slice(5)];
    if (!part || part.solved || part.wrong.includes(v)) return;
    if (part.kind === "center" && !part.active) return;
    const now = performance.now();
    const ms = Math.round(now - g.lastTapAt);
    g.lastTapAt = now;
    const correct = v === part.target;
    const att = {
      puzzle_id: g.id, kid_id: S.kid.id, at: new Date().toISOString(),
      part: part.kind, part_index: part.idx, numbers: part.numbers, target: part.target, addends: part.addends,
      picked: v, correct, ms, error_type: correct ? null : K.classifyError(part.numbers, part, v, ms),
      crosses_ten: K.crossesTen(part.addends[0], part.addends[1]), hint_shown: part.hint,
    };
    g.attempts.push(att);

    if (correct) {
      part.solved = true;
      const [a, b] = part.addends;
      if (part.kind === "center") return finish();
      const allDone = g.parts.every((p) => p.solved);
      if (allDone && g.center) {
        g.center.active = true;
        K.speak(`Yes! ${a} plus ${b} is ${part.target}. Now the middle flower!`);
      } else if (allDone) {
        return finish();
      } else {
        K.speak(`Yes! ${a} plus ${b} is ${part.target}.`);
      }
      renderGame();
      flash(partKey, v, "pop");
    } else {
      part.wrong.push(v);
      part.mistakes++;
      g.mistakes++;
      if (part.mistakes >= 2 && !part.hint) {
        part.hint = true;
        g.hints++;
        K.speak("Here's a hint. The glowing numbers add up to the answer.");
      } else {
        K.speak("Not quite. Try again!");
      }
      renderGame();
      flash(partKey, v, "shake");
    }
  }

  function starsFor(mistakes) { return mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1; }

  function puzzleRow(g, completed) {
    const dur = Math.round(elapsed(g));
    return {
      id: g.id, kid_id: S.kid.id, game: g.puzzle.settings.game, mode: g.mode,
      started_at: g.startedAt, duration_ms: dur, completed,
      mistakes: g.mistakes, hints: g.hints, stars: completed ? starsFor(g.mistakes) : 0,
      settings: g.puzzle.settings, settings_sig: K.settingsSig(g.puzzle.settings),
    };
  }

  // Save once per puzzle. Unfinished puzzles with at least one tap are saved too (they hold useful error data).
  function saveGame(completed) {
    const g = S.game;
    if (!g || g.saved) return null;
    if (!completed && !g.attempts.length) return null;
    g.saved = true;
    const row = puzzleRow(g, completed);
    K.store.savePuzzle(row, g.attempts);
    // keep the home screen numbers fresh without waiting on the network
    S.summary.stars += row.stars;
    S.summary.today_ms += row.duration_ms;
    if (completed) {
      S.summary.puzzles++;
      const d = K.localDay(Date.now());
      if (!S.summary.days.includes(d)) S.summary.days.push(d);
    }
    return row;
  }

  function stopGame() {
    if (S.game && S.game.timerId) clearInterval(S.game.timerId);
  }

  function finish() {
    const g = S.game;
    g.finished = true;
    g.activeMs = elapsed(g); g.paused = true;
    stopGame();
    const prevBest = S.summary.bests ? S.summary.bests[K.settingsSig(g.puzzle.settings)] : null;
    const row = saveGame(true);
    let raceNote = "";
    if (g.mode === "race") {
      const newBest = !prevBest || row.duration_ms < prevBest;
      if (newBest) S.summary.bests[row.settings_sig] = row.duration_ms;
      raceNote = newBest
        ? `🏁 ${fmt(row.duration_ms)} — your best time yet!`
        : `🏁 ${fmt(row.duration_ms)} · Best: ${fmt(prevBest)}`;
    }
    renderGame();
    const stars = row.stars;
    const words = ["", "Nice work!", "Great job!", "Perfect!"][stars];
    K.speak(`${words} You earned ${stars} star${stars > 1 ? "s" : ""}.`);
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `
      <div class="card">
        <h2>${words}</h2>
        <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? "" : "dim"}">⭐</span>`).join("")}</div>
        <div class="note">${raceNote || (g.mistakes === 0 ? "No mistakes!" : "Keep it up!")}</div>
        <div class="row">
          <button class="btn secondary" id="ovhome">🏠 Home</button>
          <button class="btn" id="ovnext">Next puzzle ▶</button>
        </div>
      </div>`;
    app.appendChild(ov);
    ov.querySelector("#ovhome").onclick = () => openKid(S.kid);
    ov.querySelector("#ovnext").onclick = () => (limitReached() ? showHome() : startGame());
  }

  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (S.game && !S.game.finished && $(".stage")) renderGame(); }, 150);
  });

  // test hook (harmless in production)
  window.__mathGarden = S;
  boot();
})();
