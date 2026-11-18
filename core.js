/* Kakooma Garden — shared core: settings, puzzle generator, error classifier, data store.
   Used by both index.html (kids) and parent.html (dashboard). */
(function () {
  const K = (window.K = {});
  const CFG = window.KAKOOMA_CONFIG || {};

  // ---------- small utils ----------
  K.uuid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 3) | 8).toString(16);
        });
  const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  K.localDay = (d) => new Date(d).toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  K.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- look & feel ----------
  K.AVATARS = ["🦊", "🐼", "🐨", "🦁", "🐯", "🐸", "🐵", "🦉", "🐢", "🐬", "🦄", "🐙", "🐰", "🐶", "🐱", "🦖"];
  K.COLORS = ["#2a9d8f", "#e76f51", "#6a7fdb", "#e9a23b", "#b5648f", "#4f9d4a"];
  K.PLANTS = ["🌱", "🌷", "🌻", "🌼", "🌵", "🍄", "🌳", "🌸", "🌺", "🍀", "🌴", "🪴"];
  K.STARS_PER_PLANT = 10;

  // ---------- difficulty ----------
  K.DEFAULT_SETTINGS = {
    game: "kakooma_add",
    max_sum: 10,
    petals: 3,
    per_petal: 4,
    allow_cross_ten: true,
    center_round: false,
    race_allowed: true,
    daily_minutes: 0, // 0 = unlimited
    voice: true,
  };
  K.PRESETS = [
    { name: "Seedling", note: "Sums to 10 · 3 petals", s: { max_sum: 10, petals: 3, per_petal: 4, center_round: false } },
    { name: "Sprout", note: "Sums to 10 · 4 petals + center", s: { max_sum: 10, petals: 4, per_petal: 4, center_round: true } },
    { name: "Bud", note: "Sums to 20 · 4 petals + center", s: { max_sum: 20, petals: 4, per_petal: 4, center_round: true } },
    { name: "Bloom", note: "Sums to 20 · 5 petals, 5 numbers", s: { max_sum: 20, petals: 5, per_petal: 5, center_round: true } },
    { name: "Sunflower", note: "Sums to 50", s: { max_sum: 50, petals: 5, per_petal: 5, center_round: true } },
    { name: "Mighty Oak", note: "Sums to 100", s: { max_sum: 100, petals: 5, per_petal: 5, center_round: true } },
  ];
  K.withDefaults = (s) => Object.assign({}, K.DEFAULT_SETTINGS, s || {});
  K.settingsSig = (s) => [s.game, s.max_sum, s.petals, s.per_petal, s.allow_cross_ten ? 1 : 0, s.center_round ? 1 : 0].join("|");
  K.levelName = (s) => {
    const p = K.PRESETS.find((p) => Object.keys(p.s).every((k) => p.s[k] === s[k]));
    return p ? p.name : "Custom";
  };
  K.levelLabel = (s) => `Sums up to ${s.max_sum}`;

  // ---------- puzzle generator ----------
  // A "set" is a group of distinct numbers in which exactly ONE number is the sum of two others.
  const OPS = { kakooma_add: (a, b) => a + b }; // later: subtraction / multiplication variants
  const crossesTen = (a, b) => (a % 10) + (b % 10) >= 10;
  K.crossesTen = crossesTen;

  function sumTriples(S) {
    let n = 0;
    for (let i = 0; i < S.length; i++)
      for (let j = i + 1; j < S.length; j++)
        for (let k = 0; k < S.length; k++) if (k !== i && k !== j && S[i] + S[j] === S[k]) n++;
    return n;
  }
  function pairsFor(t, allowCross, minVal) {
    const out = [];
    for (let a = minVal; a < t - a; a++) {
      const b = t - a;
      if (b < minVal) continue;
      if (!allowCross && crossesTen(a, b)) continue;
      out.push([a, b]);
    }
    return out;
  }
  function makeSet({ target = null, size, maxSum, allowCross, minVal = 1, valid = () => true }) {
    for (let tries = 0; tries < 400; tries++) {
      const t = target ?? rand(minVal * 2 + 1, maxSum);
      if (!valid(t)) { if (target != null) return null; continue; }
      const pairs = pairsFor(t, allowCross, minVal).filter(([a, b]) => valid(a) && valid(b));
      if (!pairs.length) { if (target != null) return null; continue; }
      const [a, b] = pairs[rand(0, pairs.length - 1)];
      const S = [a, b, t];
      let guard = 0;
      while (S.length < size && guard++ < 300) {
        // half the distractors sit close to the answer, so kids actually have to add
        const d = Math.random() < 0.5 ? t + rand(-3, 3) : rand(minVal, maxSum);
        if (d < minVal || d > maxSum || S.includes(d) || !valid(d)) continue;
        if (sumTriples([...S, d]) === 1) S.push(d);
      }
      if (S.length === size) return { numbers: shuffle(S), target: t, addends: [a, b] };
    }
    return null;
  }

  K.generatePuzzle = (settings) => {
    const s = K.withDefaults(settings);
    const allowCross = s.allow_cross_ten;
    for (let attempt = 0; attempt < 300; attempt++) {
      let center = null;
      let targets;
      if (s.center_round) {
        // Center numbers = the petal answers; each must itself be buildable from a pair.
        center = makeSet({
          size: s.petals, maxSum: s.max_sum, allowCross, minVal: 3,
          valid: (t) => pairsFor(t, allowCross, 1).length > 0,
        });
        if (!center) continue;
        targets = center.numbers;
      } else {
        targets = [];
        let g = 0;
        while (targets.length < s.petals && g++ < 200) {
          const t = rand(3, s.max_sum);
          if (!targets.includes(t) && pairsFor(t, allowCross, 1).length) targets.push(t);
        }
        if (targets.length < s.petals) continue;
      }
      const minVal = s.max_sum > 10 ? 2 : 1; // skip trivial "+1" facts once kids are past sums to 10
      const petals = targets.map((t) => makeSet({ target: t, size: s.per_petal, maxSum: s.max_sum, allowCross, minVal }));
      if (petals.some((p) => !p)) continue;
      return { petals, center, settings: s };
    }
    // Settings too tight (e.g. tiny number range with many numbers per petal): relax and retry.
    if (s.per_petal > 4) return K.generatePuzzle({ ...s, per_petal: s.per_petal - 1 });
    if (!s.allow_cross_ten) return K.generatePuzzle({ ...s, allow_cross_ten: true });
    throw new Error("Could not build a puzzle with these settings");
  };

  // ---------- error classification ----------
  K.ERROR_TYPES = {
    picked_addend: {
      label: "Tapped part of the pair",
      tip: "Found the right pair but tapped one of its numbers instead of the total. Re-explain the goal: tap the number that the other two make.",
    },
    counting_slip: {
      label: "Counting slip (off by 1–2)",
      tip: "Right idea, small adding error. Practice “counting on” from the bigger number (8… 9, 10, 11).",
    },
    used_twice: {
      label: "Used one number twice",
      tip: "Picked a double of a number that appears only once (e.g. 12 when there is one 6). Remind: you need two different numbers.",
    },
    picked_largest: {
      label: "Picked the biggest number",
      tip: "Leaning on a “the biggest is the answer” shortcut. Point out that the sum isn’t always the biggest number.",
    },
    quick_tap: {
      label: "Quick tap (< 1.5 s)",
      tip: "Wrong answers tapped very fast — likely rushing or guessing. Encourage a pause to check before tapping.",
    },
    guess: {
      label: "Other / unclear",
      tip: "No clear pattern in these misses.",
    },
  };

  K.classifyError = (numbers, part, picked, ms) => {
    if (part.addends.includes(picked)) return "picked_addend";
    if (Math.abs(picked - part.target) <= 2) return "counting_slip";
    if (numbers.some((y) => y !== picked && 2 * y === picked)) return "used_twice";
    if (ms < 1500) return "quick_tap";
    if (picked === Math.max(...numbers)) return "picked_largest";
    return "guess";
  };

  K.sumBand = (t) => (t <= 10 ? "≤ 10" : t <= 20 ? "11–20" : t <= 50 ? "21–50" : "51–100");

  // ---------- summaries ----------
  K.summarize = (puzzles) => {
    const today = K.localDay(Date.now());
    const sum = { stars: 0, puzzles: 0, today_ms: 0, days: [], bests: {} };
    const days = new Set();
    for (const p of puzzles) {
      sum.stars += p.stars || 0;
      const d = K.localDay(p.started_at);
      if (d === today) sum.today_ms += p.duration_ms || 0;
      if (p.completed) {
        sum.puzzles++;
        days.add(d);
        if (p.mode === "race") {
          const b = sum.bests[p.settings_sig];
          if (!b || p.duration_ms < b) sum.bests[p.settings_sig] = p.duration_ms;
        }
      }
    }
    sum.days = [...days];
    return sum;
  };
  K.streak = (days) => {
    const set = new Set(days);
    const d = new Date();
    if (!set.has(K.localDay(d))) d.setDate(d.getDate() - 1); // today not played yet: count up to yesterday
    let n = 0;
    while (set.has(K.localDay(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  };

  // ---------- data stores ----------
  // Demo store: everything in this browser's localStorage.
  const DEMO_KEY = "kakooma.demo.v1";
  const demo = {
    mode: "demo",
    _db() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || { kids: [], puzzles: [], attempts: [] }; } catch { return { kids: [], puzzles: [], attempts: [] }; } },
    _save(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); },
    async init() {},
    async listKids() { return this._db().kids.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); },
    async kidSummary(kidId) { return K.summarize(this._db().puzzles.filter((p) => p.kid_id === kidId)); },
    async savePuzzle(puzzle, attempts) {
      const db = this._db();
      db.puzzles.push(puzzle);
      db.attempts.push(...attempts);
      this._save(db);
    },
    async session() { return { demo: true }; },
    async signIn() {}, async signOut() {},
    async upsertKid(kid) {
      const db = this._db();
      const i = db.kids.findIndex((k) => k.id === kid.id);
      if (i >= 0) db.kids[i] = { ...db.kids[i], ...kid };
      else db.kids.push({ id: K.uuid(), created_at: new Date().toISOString(), ...kid });
      this._save(db);
    },
    async deleteKid(id) {
      const db = this._db();
      db.kids = db.kids.filter((k) => k.id !== id);
      db.puzzles = db.puzzles.filter((p) => p.kid_id !== id);
      db.attempts = db.attempts.filter((a) => a.kid_id !== id);
      this._save(db);
    },
    async fetchHistory(kidId, sinceIso) {
      const db = this._db();
      return {
        puzzles: db.puzzles.filter((p) => p.kid_id === kidId && p.started_at >= sinceIso),
        attempts: db.attempts.filter((a) => a.kid_id === kidId && a.at >= sinceIso),
      };
    },
  };

  // Cloud store: Supabase (shared across all devices).
  const QUEUE_KEY = "kakooma.queue.v1";
  const cloud = {
    mode: "cloud",
    sb: null,
    async init() {
      if (this.sb) return;
      this.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
      this.flushQueue();
    },
    async listKids() {
      const { data, error } = await this.sb.from("kids").select("*").order("sort");
      if (error) throw error;
      try { localStorage.setItem("kakooma.kidsCache", JSON.stringify(data)); } catch {}
      return data;
    },
    async kidSummary(kidId) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
      const { data, error } = await this.sb.rpc("kid_summary", { p_kid: kidId, p_tz: tz });
      if (error) throw error;
      return data;
    },
    async _insert(puzzle, attempts) {
      let { error } = await this.sb.from("puzzles").insert(puzzle);
      if (error && error.code !== "23505") throw error; // 23505 = already saved (retry of a queued item)
      if (attempts.length) {
        ({ error } = await this.sb.from("attempts").insert(attempts));
        if (error && error.code !== "23505") throw error;
      }
    },
    async savePuzzle(puzzle, attempts) {
      try { await this._insert(puzzle, attempts); }
      catch (e) {
        console.warn("Saving offline, will retry", e);
        const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
        q.push({ puzzle, attempts });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      }
    },
    async flushQueue() {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      if (!q.length) return;
      const left = [];
      for (const item of q) { try { await this._insert(item.puzzle, item.attempts); } catch { left.push(item); } }
      localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
    },
    async session() { const { data } = await this.sb.auth.getSession(); return data.session; },
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() { await this.sb.auth.signOut(); },
    async upsertKid(kid) {
      const { error } = await this.sb.from("kids").upsert(kid);
      if (error) throw error;
    },
    async deleteKid(id) {
      const { error } = await this.sb.from("kids").delete().eq("id", id);
      if (error) throw error;
    },
    async fetchHistory(kidId, sinceIso) {
      const [p, a] = await Promise.all([
        this.sb.from("puzzles").select("*").eq("kid_id", kidId).gte("started_at", sinceIso).order("started_at").limit(5000),
        this.sb.from("attempts").select("*").eq("kid_id", kidId).gte("at", sinceIso).order("at").limit(20000),
      ]);
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      return { puzzles: p.data, attempts: a.data };
    },
  };

  K.store = CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase ? cloud : demo;

  // ---------- voice ----------
  let voice = null;
  function pickVoice() {
    if (voice || !window.speechSynthesis) return voice;
    const vs = speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
    voice = vs.find((v) => /Samantha|Ava|Allison|Google US English/i.test(v.name)) || vs[0] || null;
    return voice;
  }
  K.voiceOn = true;
  K.speak = (text) => {
    if (!K.voiceOn || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.92;
      u.pitch = 1.05;
      const v = pickVoice();
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {}
  };
})();
