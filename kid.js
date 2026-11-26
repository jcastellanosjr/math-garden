/* Math Garden — kid experience: picker, buddy, Camp, adventure map, rounds (math / spell / read), boss battles. */
(function () {
  const app = document.getElementById("app");
  const $ = (sel) => app.querySelector(sel);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const S = { kids: [], kid: null, summary: null, st: null, mode: "practice", round: null, intro: {} };
  const DEVICE_KID = "kakooma.kidId";
  const STATE_KEY = (id) => "kakooma.state." + id;
  const STOPS = 8; // 7 rounds + boss
  const STOP_POS = [[14, 86], [38, 79], [62, 88], [85, 72], [70, 51], [42, 53], [17, 36], [50, 13]];
  const DECO_POS = [[5, 60], [94, 45], [28, 66], [56, 70], [94, 92], [6, 12], [88, 18], [30, 14]];
  const BUDDY_ANIMALS = ["🐲", "🦄", "🐻", "🦊", "🐼", "🐸", "🐙", "🦖", "🐱", "🐶", "🐰", "🦁", "🐧", "🦉", "🐵", "🐯"];
  const BUDDY_COLORS = ["#ffd6a5", "#caffbf", "#9bf6ff", "#bdb2ff", "#ffc6ff", "#fdffb6", "#ffadad", "#a0c4ff"];
  const BUDDY_NAMES = ["Pip", "Ziggy", "Bubbles", "Sparky", "Mo", "Luna", "Taco", "Noodle", "Biscuit", "Comet"];
  const GAME_INFO = {
    math: { icon: "🌸", label: "Flower Math" },
    spell: { icon: "🔤", label: "Spell It" },
    read: { icon: "📚", label: "Read It" },
  };

  // ================= boot =================
  async function boot() {
    try { await K.store.init(); S.kids = await K.store.listKids(); }
    catch (e) { console.error(e); S.kids = JSON.parse(localStorage.getItem("kakooma.kidsCache") || "[]"); }
    const kid = S.kids.find((k) => k.id === localStorage.getItem(DEVICE_KID));
    kid ? openKid(kid) : showPicker();
  }

  function showPicker() {
    stopRound();
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
    app.querySelectorAll("[data-kid]").forEach((b) => (b.onclick = () => {
      const kid = S.kids.find((k) => k.id === b.dataset.kid);
      localStorage.setItem(DEVICE_KID, kid.id);
      openKid(kid);
    }));
  }

  // ================= kid state (buddy, adventure progress) =================
  function defaultState() {
    return { v: 2, updated: "", buddy: null, world: 0, stop: 0, skills: { lantern: 1, hop: 1 }, hats: ["", "🧢", "🎀"], friends: [] };
  }
  function loadState(cloudSt, online) {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(STATE_KEY(S.kid.id))); } catch {}
    let st = cloudSt || null;
    if (local && (!st || (local.updated || "") > (st.updated || ""))) {
      st = local;
      if (online) K.store.saveState(S.kid.id, st); // device has newer progress than the cloud
    }
    S.st = Object.assign(defaultState(), st || {});
  }
  function saveState() {
    S.st.updated = new Date().toISOString();
    try { localStorage.setItem(STATE_KEY(S.kid.id), JSON.stringify(S.st)); } catch {}
    K.store.saveState(S.kid.id, S.st);
  }

  async function openKid(kid) {
    S.kid = kid;
    S.kid.settings = K.withDefaults(kid.settings);
    document.documentElement.style.setProperty("--kid", kid.color || "#2a9d8f");
    K.voiceOn = S.kid.settings.voice && localStorage.getItem("kakooma.mute") !== "1";
    if (!S.kid.settings.race_allowed) S.mode = "practice";
    let online = true;
    try { S.summary = await K.store.kidSummary(kid.id); }
    catch (e) { console.error(e); online = false; S.summary = S.summary || { stars: 0, puzzles: 0, today_ms: 0, days: [], bests: {} }; }
    loadState(S.summary.state, online);
    S.st.buddy ? showCamp() : showBuddyBuilder(true);
  }

  const limitReached = () => {
    const lim = S.kid.settings.daily_minutes;
    return lim > 0 && S.summary.today_ms >= lim * 60000;
  };

  // ================= shared bits =================
  function buddyHTML(b, size, cls = "") {
    if (!b) return "";
    return `<div class="buddy ${cls}" style="--bc:${b.color};--bs:${size}px"><span class="b-face">${b.animal}</span>${b.hat ? `<span class="b-hat">${b.hat}</span>` : ""}</div>`;
  }
  const muteBtn = () => `<button class="iconbtn ${K.voiceOn ? "" : "off"}" data-mute aria-label="Sound on or off">${K.voiceOn ? "🔊" : "🔈"}</button>`;
  function wireMute(rerender) {
    app.querySelectorAll("[data-mute]").forEach((b) => (b.onclick = () => {
      K.voiceOn = !K.voiceOn;
      localStorage.setItem("kakooma.mute", K.voiceOn ? "0" : "1");
      if (K.voiceOn) K.speak("Sound on");
      rerender();
    }));
  }
  function overlay(html) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="card">${html}</div>`;
    app.appendChild(ov);
    return ov;
  }
  const starsHTML = (n) => `<div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= n ? "" : "dim"}">⭐</span>`).join("")}</div>`;
  const plantsHTML = (stars) => Array.from({ length: Math.floor(stars / K.STARS_PER_PLANT) }, (_, i) => K.PLANTS[i % K.PLANTS.length]).join("");

  // ================= buddy builder =================
  function showBuddyBuilder(first) {
    stopRound();
    const b = S.st.buddy ? { ...S.st.buddy } : { animal: pick(BUDDY_ANIMALS), color: pick(BUDDY_COLORS), name: pick(BUDDY_NAMES), hat: "" };
    const draw = () => {
      app.innerHTML = `
        <div class="screen builder">
          <div class="builder-top">
            <h1>${first ? "Make your adventure buddy!" : "Change your buddy"}</h1>${muteBtn()}
          </div>
          <div class="builder-preview">${buddyHTML(b, 150, "bob")}<div class="nametag">${K.esc(b.name)}</div></div>
          <div class="builder-sec"><h3>1 · Pick an animal</h3><div class="opt-row">
            ${BUDDY_ANIMALS.map((a) => `<button class="opt ${a === b.animal ? "on" : ""}" data-animal="${a}">${a}</button>`).join("")}</div></div>
          <div class="builder-sec"><h3>2 · Pick a color</h3><div class="opt-row">
            ${BUDDY_COLORS.map((c) => `<button class="opt swatch ${c === b.color ? "on" : ""}" data-color="${c}" style="background:${c}" aria-label="color"></button>`).join("")}</div></div>
          <div class="builder-sec"><h3>3 · Pick a name</h3><div class="opt-row">
            ${BUDDY_NAMES.map((n) => `<button class="opt chip ${n === b.name ? "on" : ""}" data-name="${n}">${n}</button>`).join("")}</div></div>
          <div class="builder-sec"><h3>4 · Pick a hat</h3><div class="opt-row">
            ${S.st.hats.map((h) => `<button class="opt ${h === b.hat ? "on" : ""}" data-hat="${h}">${h || "🚫"}</button>`).join("")}</div></div>
          <button class="btn big" id="done">${first ? "Let's go! ▶" : "Done ✓"}</button>
        </div>`;
      app.querySelectorAll("[data-animal]").forEach((x) => (x.onclick = () => { b.animal = x.dataset.animal; draw(); }));
      app.querySelectorAll("[data-color]").forEach((x) => (x.onclick = () => { b.color = x.dataset.color; draw(); }));
      app.querySelectorAll("[data-name]").forEach((x) => (x.onclick = () => { b.name = x.dataset.name; K.speak(b.name); draw(); }));
      app.querySelectorAll("[data-hat]").forEach((x) => (x.onclick = () => { b.hat = x.dataset.hat; draw(); }));
      wireMute(draw);
      $("#done").onclick = () => {
        S.st.buddy = b;
        saveState();
        K.speak(first ? `Hi! I'm ${b.name}! Let's go on an adventure!` : `Looking good, ${b.name}!`);
        first ? showCamp() : showStuff();
      };
    };
    draw();
    if (first) K.speak("Let's make your adventure buddy! Pick an animal, a color, a name, and a hat.");
  }

  // ================= camp (home) =================
  function showCamp() {
    stopRound();
    const k = S.kid, st = S.st, sum = S.summary, W = K.worldOf(st.world);
    const streak = K.streak(sum.days || []);
    const lines = [`Ready for an adventure, ${k.name}?`, `We have ${sum.stars} stars!`, "I love puzzles!", `Let's go to ${W.name}!`, "You're a great reader!"];
    app.innerHTML = `
      <div class="screen camp">
        <div class="home-head">
          <div class="av small">${k.avatar}</div>
          <div><h1>Hi, ${K.esc(k.name)}!</h1></div>
          <div class="spacer"></div>${muteBtn()}
        </div>
        <div class="camp-stage">
          <div class="bubble">${K.esc(pick(lines))}</div>
          ${buddyHTML(st.buddy, 150, "bob")}
          <div class="nametag">${K.esc(st.buddy.name)}</div>
        </div>
        <div class="stats">
          <span class="pill">⭐ ${sum.stars}</span>
          <span class="pill">📅 ${streak} day${streak === 1 ? "" : "s"} in a row</span>
          <span class="pill">🤝 ${st.friends.length} friend${st.friends.length === 1 ? "" : "s"}</span>
        </div>
        ${limitReached()
          ? `<div class="rest">🌙 Great work today!<br>Come back tomorrow to play again.</div>
             <div class="camp-btns"><button class="bigcard" id="stuff"><span class="ic">🎒</span><b>My Stuff</b></button></div>`
          : `<div class="camp-btns">
              <button class="bigcard main" id="adv"><span class="ic">🗺️</span><b>Adventure</b><span>${W.name} · stop ${Math.min(st.stop + 1, STOPS)} of ${STOPS}</span></button>
              <button class="bigcard" id="prac"><span class="ic">🎯</span><b>Practice</b><span>Play any game</span></button>
              <button class="bigcard" id="stuff"><span class="ic">🎒</span><b>My Stuff</b><span>Hats, friends, garden</span></button>
            </div>`}
        <div class="footer-links"><button class="link" id="switch">Not ${K.esc(k.name)}? Change player</button></div>
      </div>`;
    wireMute(showCamp);
    $("#switch").onclick = () => { localStorage.removeItem(DEVICE_KID); showPicker(); };
    if ($("#adv")) $("#adv").onclick = () => showMap();
    if ($("#prac")) $("#prac").onclick = showPractice;
    $("#stuff").onclick = showStuff;
  }

  // ================= adventure map =================
  function stopTypes() {
    const nWord = Math.round((7 * S.kid.settings.word_mix) / 100);
    const out = [];
    let w = 0;
    for (let i = 0; i < 7; i++) {
      if (Math.floor(((i + 1) * nWord) / 7) > Math.floor((i * nWord) / 7)) out.push(w++ % 2 === 0 ? "spell" : "read");
      else out.push("math");
    }
    out.push("boss");
    return out;
  }

  function showMap(opts = {}) {
    stopRound();
    const st = S.st, W = K.worldOf(st.world), lap = Math.floor(st.world / K.WORLDS.length) + 1;
    const types = stopTypes();
    const pts = STOP_POS.map(([x, y]) => `${x},${y}`).join(" ");
    const buddyAt = opts.walkFrom != null ? opts.walkFrom : st.stop;
    const pos = (i) => STOP_POS[Math.min(i, STOPS - 1)];
    app.innerHTML = `
      <div class="screen mapscr">
        <div class="game-top">
          <button class="iconbtn" id="camp" aria-label="Camp">🏕️</button>
          <span class="pill">🗺️ ${W.name}${lap > 1 ? ` · Lap ${lap}` : ""}</span>
          <div class="spacer"></div>
          <span class="pill">Stop ${Math.min(st.stop + 1, STOPS)} of ${STOPS}</span>${muteBtn()}
        </div>
        <div class="map ${W.dark ? "dark" : ""}" style="background:${W.bg}">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="path"><polyline points="${pts}"/></svg>
          ${W.deco.map((d, i) => `<span class="deco" style="left:${DECO_POS[i][0]}%;top:${DECO_POS[i][1]}%">${d}</span>`).join("")}
          ${types.map((t, i) => {
            const [x, y] = STOP_POS[i];
            const state = i < st.stop ? "done" : i === st.stop ? "current" : "locked";
            const icon = t === "boss" ? W.boss.icon : GAME_INFO[t].icon;
            const label = t === "boss" ? W.boss.name : GAME_INFO[t].label;
            return `<button class="stop ${state} ${t === "boss" ? "bossstop" : ""}" data-stop="${i}" data-type="${t}" style="left:${x}%;top:${y}%">
              <span class="stop-ic">${icon}</span>${state === "done" ? `<span class="tick">✓</span>` : ""}
              <span class="stop-lab">${K.esc(label)}</span></button>`;
          }).join("")}
          <div class="map-buddy" id="mb" style="left:${pos(buddyAt)[0]}%;top:${pos(buddyAt)[1]}%">${buddyHTML(st.buddy, 54)}</div>
        </div>
      </div>`;
    wireMute(() => showMap());
    $("#camp").onclick = showCamp;
    app.querySelectorAll(".stop").forEach((b) => (b.onclick = () => {
      const i = +b.dataset.stop, t = b.dataset.type;
      if (i < st.stop) return K.speak("You already did this one!");
      if (i > st.stop) return K.speak("Finish the glowing stop first!");
      if (limitReached()) return showCamp();
      const ctx = { where: "adventure", world: st.world, stop: i };
      if (t === "boss") startBoss(ctx);
      else startGame(t, ctx);
    }));
    if (opts.walkFrom != null && opts.walkFrom !== st.stop) {
      setTimeout(() => { const mb = $("#mb"); if (mb) { mb.style.left = pos(st.stop)[0] + "%"; mb.style.top = pos(st.stop)[1] + "%"; } }, 350);
    }
    if (!S.intro.map) { S.intro.map = true; K.speak(st.stop === 0 ? `Welcome to ${W.name}! Tap the glowing stop to start.` : "Tap the glowing stop!"); }
  }

  // ================= practice =================
  function showPractice() {
    stopRound();
    const s = S.kid.settings;
    app.innerHTML = `
      <div class="screen practice">
        <div class="game-top">
          <button class="iconbtn" id="camp" aria-label="Camp">🏕️</button>
          <span class="pill">🎯 Practice</span><div class="spacer"></div>${muteBtn()}
        </div>
        <h1 class="ptitle">What do you want to play?</h1>
        <div class="pcards">
          <div class="pcard">
            <div class="ic">🌸</div><b>Flower Math</b><span>${K.levelLabel(s)}</span>
            ${s.race_allowed ? `<div class="mode-toggle">
              <button data-mode="practice" class="${S.mode === "practice" ? "on" : ""}">🌿 Calm</button>
              <button data-mode="race" class="${S.mode === "race" ? "on" : ""}">🏁 Race</button></div>` : ""}
            <button class="btn" data-play="math">Play ▶</button>
          </div>
          <div class="pcard"><div class="ic">🔤</div><b>Spell It</b><span>${K.esc(K.WORD_LEVELS[s.word_level].name)}</span><button class="btn" data-play="spell">Play ▶</button></div>
          <div class="pcard"><div class="ic">📚</div><b>Read It</b><span>${K.READ_TIERS[s.read_tier]}</span><button class="btn" data-play="read">Play ▶</button></div>
        </div>
      </div>`;
    wireMute(showPractice);
    $("#camp").onclick = showCamp;
    app.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
      S.mode = b.dataset.mode;
      K.speak(S.mode === "race" ? "Race mode. Go as fast as you can!" : "Calm mode. Take your time.");
      showPractice();
    }));
    app.querySelectorAll("[data-play]").forEach((b) => (b.onclick = () => {
      if (limitReached()) return showCamp();
      startGame(b.dataset.play, { where: "practice" });
    }));
  }

  // ================= my stuff =================
  function showStuff() {
    stopRound();
    const st = S.st, sum = S.summary;
    const toNext = sum.stars % K.STARS_PER_PLANT;
    const friends = st.friends.map((w) => K.WORLDS[w % K.WORLDS.length].boss);
    app.innerHTML = `
      <div class="screen stuff">
        <div class="game-top">
          <button class="iconbtn" id="camp" aria-label="Camp">🏕️</button>
          <span class="pill">🎒 My Stuff</span><div class="spacer"></div>${muteBtn()}
        </div>
        <div class="stuff-grid">
          <div class="garden"><h2>My buddy</h2>
            <div class="row-c">${buddyHTML(st.buddy, 90)}<div><div class="big-name">${K.esc(st.buddy.name)}</div>
            <button class="btn secondary" id="edit">✏️ Change look</button></div></div></div>
          <div class="garden"><h2>Hats</h2><p class="hint-txt">Tap a hat to wear it. Cheer up a boss to win a new one!</p>
            <div class="opt-row">${st.hats.map((h) => `<button class="opt ${h === st.buddy.hat ? "on" : ""}" data-hat="${h}">${h || "🚫"}</button>`).join("")}</div></div>
          <div class="garden"><h2>Friends</h2>
            ${friends.length ? `<div class="friends">${friends.map((f) => `<div class="friend"><span>${f.friend}</span>${K.esc(f.name.split(" ").slice(1).join(" "))}</div>`).join("")}</div>`
              : `<p class="hint-txt">Grumpy bosses become your friends when you cheer them up.</p>`}</div>
          <div class="garden"><h2>Skills</h2><p class="hint-txt">Use these in boss battles.</p>
            <div class="skill-row"><span class="pill">🔦 Lantern ×${st.skills.lantern}</span> <span class="hint-txt">takes away a wrong answer</span></div>
            <div class="skill-row"><span class="pill">⏭️ Hop ×${st.skills.hop}</span> <span class="hint-txt">skips a question</span></div></div>
          <div class="garden wide"><h2>My garden</h2>
            <div class="garden-plants">${plantsHTML(sum.stars) || `<span class="garden-empty">Earn ${K.STARS_PER_PLANT} stars to grow your first plant!</span>`}</div>
            <div class="grow">🌱 Next plant <div class="grow-bar"><i style="width:${(toNext / K.STARS_PER_PLANT) * 100}%"></i></div> ${toNext} / ${K.STARS_PER_PLANT} ⭐</div></div>
        </div>
      </div>`;
    wireMute(showStuff);
    $("#camp").onclick = showCamp;
    $("#edit").onclick = () => showBuddyBuilder(false);
    app.querySelectorAll("[data-hat]").forEach((x) => (x.onclick = () => { st.buddy.hat = x.dataset.hat; saveState(); showStuff(); }));
  }

  // ================= round framework =================
  function newRound(game, ctx, extra) {
    const now = performance.now();
    S.round = {
      id: K.uuid(), game, ctx, mode: "practice", startedAt: new Date().toISOString(),
      activeMs: 0, resumedAt: now, lastTapAt: now, paused: false,
      attempts: [], mistakes: 0, hints: 0, finished: false, saved: false, timerId: null, ...extra,
    };
    return S.round;
  }
  const elapsed = (r) => r.activeMs + (r.paused ? 0 : performance.now() - r.resumedAt);
  const fmt = (ms) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  function tapMs() { const r = S.round, now = performance.now(), ms = Math.round(now - r.lastTapAt); r.lastTapAt = now; return ms; }
  function baseAttempt(part, idx, game) {
    return { puzzle_id: S.round.id, kid_id: S.kid.id, at: new Date().toISOString(), game: game || S.round.game, part, part_index: idx, hint_shown: false };
  }
  function stopRound() { if (S.round && S.round.timerId) { clearInterval(S.round.timerId); S.round.timerId = null; } }
  const starsFor = (m) => (m === 0 ? 3 : m <= 2 ? 2 : 1);

  function saveRound(completed) {
    const r = S.round;
    if (!r || r.saved) return null;
    if (!completed && !r.attempts.length) return null;
    r.saved = true;
    const s = S.kid.settings;
    const settings = r.game === "kakooma_add" ? { ...r.puzzle.settings } : { word_level: s.word_level, read_tier: s.read_tier, word_mix: s.word_mix };
    settings.ctx = r.ctx;
    const row = {
      id: r.id, kid_id: S.kid.id, game: r.game, mode: r.mode, started_at: r.startedAt,
      duration_ms: Math.round(elapsed(r)), completed, mistakes: r.mistakes, hints: r.hints,
      stars: completed ? starsFor(r.mistakes) : 0, settings, settings_sig: r.sig,
    };
    K.store.savePuzzle(row, r.attempts);
    S.summary.stars += row.stars;
    S.summary.today_ms += row.duration_ms;
    if (completed) {
      S.summary.puzzles++;
      const d = K.localDay(Date.now());
      if (!S.summary.days.includes(d)) S.summary.days.push(d);
    }
    return row;
  }

  function leaveRound() {
    saveRound(false);
    stopRound();
    S.round.ctx.where === "adventure" ? showMap() : showPractice();
  }

  document.addEventListener("visibilitychange", () => {
    const r = S.round;
    if (!r || r.finished) return;
    if (document.hidden && !r.paused) { r.activeMs += performance.now() - r.resumedAt; r.paused = true; saveRound(false); }
    else if (!document.hidden && r.paused) { r.resumedAt = performance.now(); r.lastTapAt = performance.now(); r.paused = false; }
  });

  function topBar({ dots, timer } = {}) {
    const r = S.round;
    return `
      <div class="game-top">
        <button class="iconbtn" id="back" aria-label="Back">${r.ctx.where === "adventure" ? "🗺️" : "🏠"}</button>
        <span class="pill">${buddyHTML(S.st.buddy, 26, "tiny")} ${K.esc(S.st.buddy.name)}</span>
        ${dots ? `<span class="dots">${dots.map((d) => `<i class="${d}"></i>`).join("")}</span>` : ""}
        <div class="spacer"></div>
        ${timer ? `<span class="pill timer" id="timer">⏱ ${fmt(elapsed(r))}</span>` : ""}
        ${muteBtn()}
      </div>`;
  }
  function wireTop() {
    $("#back").onclick = leaveRound;
    wireMute(() => S.round.render());
  }

  // Called when a round (not boss) is finished.
  function finishRound(extraNote) {
    const r = S.round;
    r.finished = true;
    r.activeMs = elapsed(r); r.paused = true;
    stopRound();
    const prevBest = r.game === "kakooma_add" && S.summary.bests ? S.summary.bests[r.sig] : null;
    const row = saveRound(true);
    let note = extraNote || (r.mistakes === 0 ? "No mistakes!" : "Keep it up!");
    if (r.mode === "race") {
      const best = !prevBest || row.duration_ms < prevBest;
      if (best) S.summary.bests[row.settings_sig] = row.duration_ms;
      note = best ? `🏁 ${fmt(row.duration_ms)} — your best time yet!` : `🏁 ${fmt(row.duration_ms)} · Best: ${fmt(prevBest)}`;
    }
    let walkFrom = null;
    if (r.ctx.where === "adventure" && r.ctx.world === S.st.world && r.ctx.stop === S.st.stop) {
      walkFrom = S.st.stop;
      S.st.stop++;
      saveState();
    }
    r.render();
    const words = ["", "Nice work!", "Great job!", "Perfect!"][row.stars];
    K.speak(`${words} You earned ${row.stars} star${row.stars > 1 ? "s" : ""}.`);
    const adv = r.ctx.where === "adventure";
    const ov = overlay(`
      <h2>${words}</h2>${starsHTML(row.stars)}
      <div class="note">${note}</div>
      <div class="row">
        <button class="btn secondary" id="ov2">${adv ? "🏕️ Camp" : "⬅ Back"}</button>
        <button class="btn" id="ov1">${adv ? "Back to map ▶" : "Play again ▶"}</button>
      </div>`);
    ov.querySelector("#ov1").onclick = () => {
      if (adv) return showMap({ walkFrom });
      if (limitReached()) return showCamp();
      startGame(r.kind, r.ctx);
    };
    ov.querySelector("#ov2").onclick = () => (adv ? showCamp() : showPractice());
  }

  function startGame(kind, ctx) {
    if (kind === "math") startMath(ctx);
    else if (kind === "spell") startSpell(ctx);
    else startRead(ctx);
  }

  // ================= Flower Math (Kakooma) =================
  function startMath(ctx) {
    const puzzle = K.generatePuzzle(S.kid.settings);
    const parts = puzzle.petals.map((p, i) => ({ kind: "petal", idx: i, ...p, solved: false, wrong: [], mistakes: 0, hint: false }));
    const center = puzzle.center ? { kind: "center", idx: 0, ...puzzle.center, solved: false, wrong: [], mistakes: 0, hint: false, active: false } : null;
    const mode = ctx.where === "practice" ? S.mode : "practice";
    const r = newRound("kakooma_add", ctx, { kind: "math", puzzle, parts, center, mode, sig: K.settingsSig(puzzle.settings), render: renderMath });
    renderMath();
    if (mode === "race") r.timerId = setInterval(() => { const el = $("#timer"); if (el) el.textContent = "⏱ " + fmt(elapsed(r)); }, 250);
    if (!S.intro.math) { S.intro.math = true; K.speak("In each flower petal, find two numbers that add up to another number. Tap the answer!"); }
  }

  function mathLayout() {
    const w = Math.min(window.innerWidth - 24, 760);
    const h = window.innerHeight - 170;
    const size = Math.max(300, Math.min(w, h));
    return { size, R: size * 0.335, petalD: size * 0.33, centerD: size * 0.3, btn: size * 0.33 * 0.27 };
  }

  function renderMath() {
    const g = S.round, s = g.puzzle.settings, L = mathLayout();
    const c = L.size / 2, n = g.parts.length;
    const ring = (cx, cy, r, count, i) => { const a = (-90 + (360 / count) * i) * (Math.PI / 180); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const fs = Math.round(L.btn * (s.max_sum >= 100 ? 0.4 : 0.46));
    const numBtn = (part, v, x, y) => {
      const cls = ["num"];
      if (part.solved) cls.push(v === part.target ? "right" : "fade");
      else if (part.wrong.includes(v)) cls.push("wrong");
      if (!part.solved && part.hint && part.addends.includes(v)) cls.push("hint");
      return `<button class="${cls.join(" ")}" data-part="${part.kind}${part.idx}" data-v="${v}" style="left:${x}px;top:${y}px;width:${L.btn}px;height:${L.btn}px;font-size:${fs}px">${v}</button>`;
    };
    let html = "";
    g.parts.forEach((p, i) => {
      const [px, py] = ring(c, c, L.R, n, i);
      html += `<div class="petal ${p.solved ? "solved" : ""}" style="left:${px - L.petalD / 2}px;top:${py - L.petalD / 2}px;width:${L.petalD}px;height:${L.petalD}px"></div>`;
      p.numbers.forEach((v, j) => { const [x, y] = ring(px, py, L.petalD * 0.3, p.numbers.length, j); html += numBtn(p, v, x, y); });
    });
    const cc = g.center;
    const cState = cc ? (cc.solved ? "solved" : cc.active ? "active" : "") : "";
    html += `<div class="center ${cState}" style="left:${c - L.centerD / 2}px;top:${c - L.centerD / 2}px;width:${L.centerD}px;height:${L.centerD}px">
      ${cc ? "" : `<span class="progress">🌸 ${g.parts.filter((p) => p.solved).length} / ${n}</span>`}</div>`;
    if (cc) cc.numbers.forEach((v, j) => {
      const [x, y] = ring(c, c, L.centerD * 0.29, cc.numbers.length, j);
      if (cc.active || cc.solved) html += numBtn(cc, v, x, y);
      else { const f = g.parts[j].solved; html += `<div class="num slot ${f ? "filled" : ""}" style="left:${x}px;top:${y}px;width:${L.btn}px;height:${L.btn}px;font-size:${fs}px">${f ? v : "?"}</div>`; }
    });
    const centerMsg = cc && cc.active && !cc.solved;
    app.innerHTML = `
      <div class="screen game">
        ${topBar({ timer: g.mode === "race" })}
        <div class="howto">
          <span class="eg">🔍 ${centerMsg ? "Middle!" : "3 + 4 = <u>7</u>"}</span>
          <span class="txt">${centerMsg ? "Now the middle flower! Find the sum and tap it! 👆" : "Find 2 numbers that make a 3rd number. Tap the answer! 👆"}</span>
          <button class="iconbtn" id="say" aria-label="Read it to me">💬</button>
        </div>
        <div class="stage" style="width:${L.size}px;height:${L.size}px">${html}</div>
      </div>`;
    wireTop();
    $("#say").onclick = () => K.speak(centerMsg ? "Now the middle flower. Find two numbers that add up to another number, and tap it." : "In each petal, find two numbers that add up to another number. Tap the answer!");
    app.querySelectorAll(".num[data-part]").forEach((b) => b.addEventListener("click", () => tapMath(b.dataset.part, +b.dataset.v)));
  }

  function flash(sel, cls) { const el = app.querySelector(sel); if (el) { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 450); } }

  function tapMath(partKey, v) {
    const g = S.round;
    if (!g || g.finished) return;
    const part = partKey.startsWith("center") ? g.center : g.parts[+partKey.slice(5)];
    if (!part || part.solved || part.wrong.includes(v)) return;
    if (part.kind === "center" && !part.active) return;
    const ms = tapMs();
    const correct = v === part.target;
    g.attempts.push({
      ...baseAttempt(part.kind, part.idx), numbers: part.numbers, target: part.target, addends: part.addends,
      picked: v, correct, ms, error_type: correct ? null : K.classifyError(part.numbers, part, v, ms),
      crosses_ten: K.crossesTen(part.addends[0], part.addends[1]), hint_shown: part.hint,
    });
    const sel = `.num[data-part="${partKey}"][data-v="${v}"]`;
    if (correct) {
      part.solved = true;
      const [a, b] = part.addends;
      if (part.kind === "center") return finishRound();
      const allDone = g.parts.every((p) => p.solved);
      if (allDone && g.center) { g.center.active = true; K.speak(`Yes! ${a} plus ${b} is ${part.target}. Now the middle flower!`); }
      else if (allDone) return finishRound();
      else K.speak(`Yes! ${a} plus ${b} is ${part.target}.`);
      renderMath(); flash(sel, "pop");
    } else {
      part.wrong.push(v); part.mistakes++; g.mistakes++;
      if (part.mistakes >= 2 && !part.hint) { part.hint = true; g.hints++; K.speak("Here's a hint. The glowing numbers add up to the answer."); }
      else K.speak("Not quite. Try again!");
      renderMath(); flash(sel, "shake");
    }
  }

  // ================= Spell It (Word Builder) =================
  function startSpell(ctx) {
    const lvl = S.kid.settings.word_level;
    newRound("word_build", ctx, { kind: "spell", sig: `word_build|${K.levelKey(lvl)}`, words: K.makeWordRound(lvl, 5), wi: 0, render: renderSpell });
    setupWord();
    renderSpell();
    const w = S.round.cur.word;
    if (!S.intro.spell) { S.intro.spell = true; K.speak(`Listen, then tap the letters to spell the word. Spell: ${w}.`); }
    else K.speak(`Spell: ${w}.`);
  }
  function setupWord() {
    const r = S.round, w = r.words[r.wi];
    r.cur = { ...w, tiles: w.tiles.map((ch) => ({ ch, used: false })), slots: Array(w.word.length).fill(null), locked: Array(w.word.length).fill(false), checks: 0, hint: false, done: false, bad: [] };
  }
  function renderSpell() {
    const r = S.round, c = r.cur, len = c.word.length;
    const width = Math.min(window.innerWidth, 820) - 40;
    const slot = Math.min(76, Math.floor(width / len) - 8);
    const tile = Math.min(76, Math.floor(width / Math.ceil(c.tiles.length / (c.tiles.length > 8 ? 2 : 1))) - 10);
    const dots = r.words.map((_, i) => (i < r.wi ? "done" : i === r.wi ? "now" : ""));
    app.innerHTML = `
      <div class="screen game">
        ${topBar({ dots })}
        <div class="howto"><span class="eg">🔤 Spell it</span><span class="txt">Listen, then tap the letters to spell the word!</span>
          <button class="iconbtn" id="hear" aria-label="Hear the word">🔊</button></div>
        <div class="wb">
          <button class="wb-pic" id="pic">${c.emoji}</button>
          <div class="slots">${c.slots.map((t, j) => {
            const filled = t != null;
            const cls = ["slot2", filled ? "filled" : "", c.locked[j] ? "locked" : "", c.done ? "right" : "", c.bad.includes(j) ? "shake2" : ""].join(" ");
            return `<button class="${cls}" data-slot="${j}" style="width:${slot}px;height:${slot * 1.15}px;font-size:${slot * 0.55}px">${filled ? c.tiles[t].ch : ""}</button>`;
          }).join("")}</div>
          <div class="ltiles">${c.tiles.map((t, i) => `<button class="ltile ${t.used ? "used" : ""}" data-tile="${i}" style="width:${tile}px;height:${tile}px;font-size:${tile * 0.5}px">${t.ch}</button>`).join("")}</div>
        </div>
      </div>`;
    c.bad = [];
    wireTop();
    $("#hear").onclick = $("#pic").onclick = () => K.speak(c.word);
    app.querySelectorAll("[data-tile]").forEach((b) => (b.onclick = () => tapTile(+b.dataset.tile)));
    app.querySelectorAll("[data-slot]").forEach((b) => (b.onclick = () => tapSlot(+b.dataset.slot)));
  }
  function tapTile(i) {
    const c = S.round.cur;
    if (c.done || c.tiles[i].used || c.checking) return;
    const j = c.slots.findIndex((t, k) => t == null && !c.locked[k]);
    if (j < 0) return;
    c.slots[j] = i; c.tiles[i].used = true;
    renderSpell();
    if (c.slots.every((t) => t != null)) { c.checking = true; setTimeout(checkWord, 350); }
  }
  function tapSlot(j) {
    const c = S.round.cur;
    if (c.done || c.locked[j] || c.slots[j] == null || c.checking) return;
    c.tiles[c.slots[j]].used = false; c.slots[j] = null;
    renderSpell();
  }
  function hintLetter(c) {
    const j = c.locked.findIndex((l) => !l);
    if (j < 0) return;
    if (c.slots[j] != null) { c.tiles[c.slots[j]].used = false; c.slots[j] = null; }
    const t = c.tiles.findIndex((x) => !x.used && x.ch === c.word[j]);
    if (t >= 0) { c.slots[j] = t; c.tiles[t].used = true; c.locked[j] = true; }
  }
  function checkWord() {
    const r = S.round, c = r.cur;
    c.checking = false;
    if (!S.round || S.round !== r || r.finished) return;
    const resp = c.slots.map((t) => c.tiles[t].ch).join("");
    const ms = tapMs();
    const correct = resp === c.word;
    r.attempts.push({ ...baseAttempt("word", r.wi), item: c.word, answer: c.word, response: resp, correct, ms,
      error_type: correct ? null : K.classifySpelling(c.word, resp, c.level), skill: c.level, hint_shown: c.hint });
    if (correct) return wordDone(true);
    r.mistakes++; c.checks++;
    [...c.word].forEach((ch, j) => {
      if (resp[j] === ch) c.locked[j] = true;
      else { c.tiles[c.slots[j]].used = false; c.slots[j] = null; c.bad.push(j); }
    });
    if (c.checks >= 2) {
      if (!c.hint) { c.hint = true; r.hints++; }
      hintLetter(c);
      K.speak(`Here's a help letter. ${c.word}.`);
    } else K.speak(`Almost! Try again. ${c.word}.`);
    if (c.locked.every(Boolean)) return wordDone(false);
    renderSpell();
  }
  function wordDone(firstTry) {
    const r = S.round, c = r.cur;
    c.done = true; c.locked = c.locked.map(() => true);
    renderSpell();
    K.speak(firstTry ? `Yes! ${c.word}!` : `${c.word}! You got it.`);
    setTimeout(() => {
      if (S.round !== r || r.finished) return;
      r.wi++;
      if (r.wi >= r.words.length) return finishRound();
      setupWord(); renderSpell(); K.speak(`Spell: ${r.cur.word}.`);
    }, 1400);
  }

  // ================= Read It (Read & Pick) =================
  function startRead(ctx) {
    const tier = S.kid.settings.read_tier;
    newRound("read_pick", ctx, { kind: "read", sig: `read_pick|${tier}`, qs: K.makeReadRound(tier, 4), qi: 0, render: renderRead });
    S.round.cur = { ...S.round.qs[0], wrong: [], done: false };
    renderRead();
    sayReadInstr(true);
  }
  function sayReadInstr(first) {
    const q = S.round.cur;
    if (first && S.intro.read) return;
    S.intro.read = true;
    K.speak(q.kind === "riddle" ? "Read the clues. Then tap the answer." : "Read the sentence. Then tap the missing word.");
  }
  function readQuestionHTML(q, onlyChoicesCls = "") {
    const text = K.esc(q.text).replace("___", `<span class="blank">${q.done && q.kind === "gap" ? K.esc(q.answer) : "&nbsp;?&nbsp;"}</span>`);
    return `
      <div class="rp-text">${text}</div>
      ${q.kind === "riddle" ? `<div class="rp-ask">What am I?</div>` : ""}
      <div class="choices ${q.kind === "riddle" ? "pics" : "words"} ${onlyChoicesCls}">
        ${q.choices.map((ch) => choiceBtn(q, ch)).join("")}
      </div>`;
  }
  function choiceBtn(q, ch) {
    const cls = ["choice"], c = String(ch), ans = String(q.answer);
    if (q.done && c === ans) cls.push("right");
    if (q.wrong && q.wrong.includes(c)) cls.push("wrongc");
    if (q.picked != null && String(q.picked) === c && c !== ans) cls.push("wrongc");
    if (q.removed && q.removed.includes(c)) cls.push("gone");
    return `<button class="${cls.join(" ")}" data-choice="${K.esc(ch)}">${K.esc(ch)}</button>`;
  }
  function renderRead() {
    const r = S.round, q = r.cur;
    const dots = r.qs.map((_, i) => (i < r.qi ? "done" : i === r.qi ? "now" : ""));
    app.innerHTML = `
      <div class="screen game">
        ${topBar({ dots })}
        <div class="howto"><span class="eg">📚 Read it</span><span class="txt">${q.kind === "riddle" ? "Read the clues, then tap the answer!" : "Read the sentence, then tap the missing word!"}</span>
          <button class="iconbtn" id="say" aria-label="Read the instructions">💬</button></div>
        <div class="rp-card">${readQuestionHTML(q)}</div>
      </div>`;
    wireTop();
    $("#say").onclick = () => sayReadInstr(false);
    app.querySelectorAll("[data-choice]").forEach((b) => (b.onclick = () => pickRead(b.dataset.choice)));
  }
  function pickRead(ch) {
    const r = S.round, q = r.cur;
    if (q.done || q.wrong.includes(ch)) return;
    const ms = tapMs();
    const correct = ch === q.answer;
    r.attempts.push({ ...baseAttempt("read", r.qi), item: q.text, answer: q.answer, response: ch, correct, ms,
      error_type: K.classifyReading(q, ch, ms), skill: `${q.kind}:${q.tier}` });
    if (correct) {
      q.done = true; renderRead();
      K.speak(q.kind === "gap" ? `Yes! ${q.text.replace("___", q.answer)}` : pick(["Yes! You got it!", "That's right!", "Great reading!"]));
      setTimeout(() => {
        if (S.round !== r || r.finished) return;
        r.qi++;
        if (r.qi >= r.qs.length) return finishRound();
        r.cur = { ...r.qs[r.qi], wrong: [], done: false };
        renderRead(); sayReadInstr(true);
      }, q.kind === "gap" ? 2600 : 1500);
    } else {
      q.wrong.push(ch); r.mistakes++;
      K.speak("Not quite. Read it again!");
      renderRead();
    }
  }

  // ================= Boss battle =================
  const BOSS_NEED = 6;
  function startBoss(ctx) {
    const W = K.worldOf(S.st.world);
    newRound("boss", ctx, { kind: "boss", sig: `boss|${S.st.world % K.WORLDS.length}`, W, hp: 0, qn: 0, render: renderBoss, mood: "" });
    nextBossQ();
    renderBoss();
    K.speak(`Oh no! ${W.boss.name} is blocking the path! Answer questions to cheer it up!`);
  }
  function nextBossQ() {
    const r = S.round, s = S.kid.settings;
    const roll = Math.random() * 100;
    const type = roll >= s.word_mix ? "math" : Math.random() < 0.5 ? "spell" : "read";
    const q = type === "math" ? K.makeMathQuick(s) : type === "spell" ? K.makeSpellPick(s.word_level) : K.makeReadQuestion(s.read_tier);
    r.cur = { ...q, removed: [], done: false, picked: null };
    r.qn++;
    const cur = r.cur;
    if (type === "spell") setTimeout(() => { if (S.round === r && r.cur === cur && !cur.done) K.speak(`Which one spells ${q.word}?`); }, 500);
  }
  function bossQuestionHTML(q) {
    if (q.type === "math") return `<div class="q-prompt">${q.addends[0]} + ${q.addends[1]} = ?</div>
      <div class="choices nums">${q.choices.map((c) => choiceBtn(q, c)).join("")}</div>`;
    if (q.type === "spell") return `<div class="q-row"><button class="q-pic" id="qhear">${q.emoji}</button><div class="q-sub">Which spelling is right? <button class="iconbtn" id="qhear2">🔊</button></div></div>
      <div class="choices words">${q.choices.map((c) => choiceBtn(q, c)).join("")}</div>`;
    return readQuestionHTML(q);
  }
  function renderBoss() {
    const r = S.round, W = r.W, st = S.st, q = r.cur;
    const friend = r.finished;
    app.innerHTML = `
      <div class="screen boss ${W.dark ? "dark" : ""}" style="background:${W.bg}">
        ${topBar()}
        <div class="boss-area">
          <div class="boss-emoji ${r.mood} ${friend ? "friend" : ""}" id="bossE">${friend ? W.boss.friend : W.boss.icon}${friend ? "" : `<span class="grr">💢</span>`}</div>
          <div class="boss-name">${K.esc(W.boss.name)}</div>
          <div class="meter" aria-label="cheer meter">${"💛".repeat(r.hp)}${"🤍".repeat(BOSS_NEED - r.hp)}</div>
        </div>
        <div class="qcard">${bossQuestionHTML(q)}</div>
        <div class="boss-bottom">
          ${buddyHTML(st.buddy, 80, "boss-buddy")}
          <div class="spacer"></div>
          <button class="skill ${st.skills.lantern ? "" : "off"}" id="lantern">🔦<small>×${st.skills.lantern}</small></button>
          <button class="skill ${st.skills.hop ? "" : "off"}" id="hop">⏭️<small>×${st.skills.hop}</small></button>
        </div>
      </div>`;
    r.mood = "";
    wireTop();
    app.querySelectorAll("[data-choice]").forEach((b) => (b.onclick = () => answerBoss(b.dataset.choice)));
    ["#qhear", "#qhear2"].forEach((id) => { const b = $(id); if (b) b.onclick = () => K.speak(q.word); });
    $("#lantern").onclick = () => {
      if (!st.skills.lantern) return K.speak("No lanterns left. Cheer up a boss to get more!");
      if (q.done || q.removed.length) return;
      const wrong = q.choices.filter((c) => String(c) !== String(q.answer));
      q.removed.push(String(pick(wrong)));
      st.skills.lantern--; r.hints++; saveState();
      K.speak("Lantern! One wrong answer is gone.");
      renderBoss();
    };
    $("#hop").onclick = () => {
      if (!st.skills.hop) return K.speak("No hops left. Cheer up a boss to get more!");
      if (q.done) return;
      st.skills.hop--; saveState();
      K.speak("Hop! Here's a new question.");
      nextBossQ(); renderBoss();
    };
  }
  function throwTreat() {
    const from = $(".boss-buddy"), to = $("#bossE");
    if (!from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const el = document.createElement("span");
    el.className = "treat";
    el.textContent = S.round.W.treat;
    el.style.left = a.left + a.width / 2 - 20 + "px";
    el.style.top = a.top + "px";
    document.body.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - a.top;
    const anim = el.animate([{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx / 2}px,${dy / 2 - 80}px) scale(1.3)` }, { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0.2 }], { duration: 700, easing: "ease-in-out" });
    anim.onfinish = () => el.remove();
  }
  function answerBoss(raw) {
    const r = S.round, q = r.cur;
    if (q.done || r.finished || q.removed.includes(raw)) return;
    const ms = tapMs();
    const val = q.type === "math" ? +raw : raw;
    const correct = val === q.answer;
    q.done = true; q.picked = q.type === "math" ? val : raw;
    if (q.type === "math") {
      r.attempts.push({ ...baseAttempt("boss", r.qn, "math_quick"), numbers: q.choices, target: q.target, addends: q.addends, picked: val, correct, ms,
        error_type: K.classifyQuickMath(q, val, ms), crosses_ten: K.crossesTen(q.addends[0], q.addends[1]), hint_shown: q.removed.length > 0 });
    } else if (q.type === "spell") {
      r.attempts.push({ ...baseAttempt("boss", r.qn, "word_pick"), item: q.word, answer: q.word, response: raw, correct, ms,
        error_type: K.classifySpelling(q.word, raw, q.level), skill: q.level, hint_shown: q.removed.length > 0 });
    } else {
      r.attempts.push({ ...baseAttempt("boss", r.qn, "read_pick"), item: q.text, answer: q.answer, response: raw, correct, ms,
        error_type: K.classifyReading(q, raw, ms), skill: `${q.kind}:${q.tier}`, hint_shown: q.removed.length > 0 });
    }
    if (correct) {
      r.hp++; r.mood = "hit";
      renderBoss(); throwTreat();
      K.speak(r.hp >= BOSS_NEED ? "Yes!" : pick(["Great job!", "Yes!", "Nice one!", "You got it!", "It's smiling a little!"]));
    } else {
      r.mistakes++; r.mood = "giggle";
      renderBoss();
      const ans = q.type === "math" ? q.answer : q.type === "spell" ? `${q.word}` : q.kind === "gap" ? q.answer : "";
      K.speak(ans ? `Hee hee! The answer was ${ans}. Let's try another!` : "Hee hee! Not that one. Let's try another!");
    }
    setTimeout(() => {
      if (S.round !== r || r.finished) return;
      if (r.hp >= BOSS_NEED) return winBoss();
      nextBossQ(); renderBoss();
    }, correct ? 1400 : 2600);
  }
  function winBoss() {
    const r = S.round, st = S.st, W = r.W;
    r.finished = true; r.activeMs = elapsed(r); r.paused = true;
    const row = saveRound(true);
    const wi = st.world % K.WORLDS.length;
    let newHat = null;
    if (r.ctx.world === st.world && r.ctx.stop === st.stop) {
      if (!st.friends.includes(wi)) st.friends.push(wi);
      if (!st.hats.includes(W.boss.hat)) { st.hats.push(W.boss.hat); newHat = W.boss.hat; }
      st.skills.lantern += 2; st.skills.hop += 1;
      st.world++; st.stop = 0;
      saveState();
    }
    renderBoss();
    const next = K.worldOf(st.world);
    K.speak(`Hooray! ${W.boss.name} is your friend now!${newHat ? " You won a new hat!" : ""}`);
    const ov = overlay(`
      <div class="friend-big">${W.boss.friend}</div>
      <h2>${K.esc(W.boss.name)} is your friend now!</h2>${starsHTML(row.stars)}
      <div class="note">You got: ${newHat ? `${newHat} a new hat · ` : ""}🔦 +2 · ⏭️ +1</div>
      <div class="row">
        <button class="btn secondary" id="ov2">🏕️ Camp</button>
        <button class="btn" id="ov1">To ${K.esc(next.name)} ▶</button>
      </div>`);
    ov.querySelector("#ov1").onclick = () => { S.intro.map = false; showMap(); };
    ov.querySelector("#ov2").onclick = showCamp;
  }

  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (S.round && !S.round.finished && !app.querySelector(".overlay") && $(".game, .boss")) S.round.render(); }, 150);
  });

  window.__mathGarden = S; // test hook
  boot();
})();
