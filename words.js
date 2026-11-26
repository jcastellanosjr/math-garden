/* Math Garden — word & reading content, generators and error classifiers. Loaded after core.js. */
(function () {
  const K = window.K;
  const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const pick = (a) => a[rand(0, a.length - 1)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const VOWELS = "aeiou";
  const isVowel = (c) => VOWELS.includes(c);

  // ---------------- spelling levels (follows the usual phonics teaching order) ----------------
  const spansOf = (re) => (w) => { const out = []; let m; re.lastIndex = 0; while ((m = re.exec(w))) out.push([m.index, m.index + m[0].length]); return out; };
  K.WORD_LEVELS = [
    { key: "blends", name: "Blends", eg: "frog, nest, drum",
      spans: (w) => { const s = []; const a = w.match(/^(spr|str|scr|spl|[bcdfgpt][lr]|s[cklmnptw]|sw|tw)/); if (a) s.push([0, a[0].length]);
        const b = w.match(/(st|nt|nd|ft|lk|sk|mp|nk|lt)$/); if (b) s.push([w.length - 2, w.length]); return s; },
      words: [["frog","🐸"],["crab","🦀"],["drum","🥁"],["flag","🚩"],["sled","🛷"],["swan","🦢"],["skunk","🦨"],["plant","🪴"],["nest","🪺"],["tent","⛺"],["hand","✋"],["gift","🎁"],["milk","🥛"],["mask","🎭"],["drop","💧"]] },
    { key: "digraphs", name: "sh · ch · th · ck · ng", eg: "ship, duck, ring",
      spans: spansOf(/(tch|sh|ch|th|ck|ng|wh)/g), alt: { sh: "s", ch: "c", th: "f", ck: "k", ng: "n", wh: "w" },
      words: [["ship","🚢"],["fish","🐟"],["shell","🐚"],["chick","🐤"],["duck","🦆"],["sock","🧦"],["lock","🔒"],["bath","🛁"],["ring","💍"],["king","🤴"],["sloth","🦥"],["truck","🚚"],["clock","⏰"],["brush","🖌️"],["dish","🍽️"]] },
    { key: "silent_e", name: "Silent e", eg: "cake, kite, bone",
      spans: (w) => { const m = w.match(/([aeiou])([^aeiou]{1,2})e$/); if (!m) return []; const i = w.length - m[0].length; return [[i, i + 1], [w.length - 1, w.length]]; },
      words: [["cake","🎂"],["snake","🐍"],["whale","🐳"],["kite","🪁"],["bike","🚲"],["dice","🎲"],["rose","🌹"],["bone","🦴"],["nose","👃"],["globe","🌍"],["cube","🧊"],["plane","✈️"],["smile","😊"],["slide","🛝"],["rope","🪢"],["home","🏠"]] },
    { key: "vowel_teams", name: "Vowel teams (ai, ee, oa, oo…)", eg: "rain, tree, boat",
      spans: spansOf(/(ai|ay|ee|ea|oa|ow|oo|ie|ue)/g), alt: { ai: "ay", ay: "ai", ee: "ea", ea: "ee", oa: "o", ow: "o", oo: "u", ie: "y", ue: "u" },
      words: [["rain","🌧️"],["snail","🐌"],["train","🚆"],["mail","📬"],["tree","🌳"],["bee","🐝"],["sheep","🐑"],["feet","🦶"],["seal","🦭"],["leaf","🍃"],["peach","🍑"],["boat","⛵"],["goat","🐐"],["coat","🧥"],["soap","🧼"],["moon","🌙"],["spoon","🥄"],["boot","👢"],["broom","🧹"],["tooth","🦷"],["book","📖"],["pie","🥧"],["snow","❄️"],["bowl","🥣"]] },
    { key: "r_controlled", name: "Bossy r (ar, or, ir, ur, er)", eg: "star, fork, bird",
      spans: spansOf(/(ar|er|ir|or|ur)/g), alt: { ar: "or", or: "ar", ir: "ur", ur: "er", er: "ir" },
      words: [["car","🚗"],["star","⭐"],["shark","🦈"],["jar","🫙"],["bird","🐦"],["girl","👧"],["shirt","👕"],["fork","🍴"],["corn","🌽"],["horse","🐴"],["horn","📯"],["storm","⛈️"],["purse","👛"],["yarn","🧶"],["scarf","🧣"],["worm","🪱"]] },
    { key: "two_syllable", name: "Two-syllable words", eg: "rabbit, rocket, pencil",
      spans: () => [],
      words: [["rabbit","🐇"],["kitten","🐈"],["pumpkin","🎃"],["sunset","🌅"],["rocket","🚀"],["robot","🤖"],["pencil","✏️"],["button","🔘"],["basket","🧺"],["muffin","🧁"],["dragon","🐉"],["lemon","🍋"],["carrot","🥕"],["monkey","🐒"],["penguin","🐧"],["tiger","🐯"],["zebra","🦓"],["spider","🕷️"],["candle","🕯️"],["apple","🍎"],["magnet","🧲"],["cactus","🌵"]] },
    { key: "compound", name: "Compound words", eg: "rainbow, snowman",
      spans: () => [],
      words: [["rainbow","🌈"],["sunflower","🌻"],["snowman","⛄"],["cupcake","🧁"],["popcorn","🍿"],["football","🏈"],["toothbrush","🪥"],["butterfly","🦋"],["ladybug","🐞"],["pancake","🥞"],["mailbox","📫"],["jellyfish","🪼"],["backpack","🎒"],["skateboard","🛹"]] },
  ];
  K.READ_TIERS = ["Short sentences", "Longer sentences", "Multi-clue sentences"];
  K.levelKey = (i) => K.WORD_LEVELS[Math.max(0, Math.min(K.WORD_LEVELS.length - 1, i | 0))].key;
  K.skillName = (key) => (K.WORD_LEVELS.find((l) => l.key === key) || {}).name || key;

  const FLIP = { b: "d", d: "b", p: "q", q: "p", m: "n", n: "m" };

  // ---------------- avoid repeating the same items too often ----------------
  const RECENT_KEY = "kakooma.recent";
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
  function remember(items) { const r = [...items, ...recent()].slice(0, 30); try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch {} }
  function pickFresh(pool, n, idOf) {
    const seen = new Set(recent());
    const fresh = shuffle(pool.filter((x) => !seen.has(idOf(x))));
    const rest = shuffle(pool.filter((x) => seen.has(idOf(x))));
    const out = [...fresh, ...rest].slice(0, n);
    remember(out.map(idOf));
    return out;
  }

  // ---------------- Word Builder ----------------
  function patternAlt(word, L) {
    if (!L.alt) return null;
    for (const [k, v] of Object.entries(L.alt)) if (word.includes(k)) return v[0] === k[0] ? v[v.length - 1] : v[0];
    return null;
  }
  K.makeWordRound = (level, n = 5) => {
    const L = K.WORD_LEVELS[level] || K.WORD_LEVELS[0];
    return pickFresh(L.words, n, (w) => w[0]).map(([word, emoji]) => {
      const extra = [];
      const flip = [...word].map((c) => FLIP[c]).find(Boolean);
      if (flip) extra.push(flip);
      const alt = patternAlt(word, L);
      if (alt && !extra.includes(alt)) extra.push(alt);
      const vs = [...VOWELS].filter((v) => !word.includes(v));
      if (vs.length) extra.push(pick(vs));
      while (extra.length < (word.length > 6 ? 3 : 2)) { const c = pick([..."bcdfghklmnprstw"].filter((c) => !word.includes(c))); extra.push(c); }
      return { word, emoji, level: L.key, tiles: shuffle([...word, ...extra.slice(0, 3)]) };
    });
  };

  // ---------------- spelling error classifier ----------------
  K.classifySpelling = (word, resp, levelKey) => {
    if (resp === word) return null;
    const L = K.WORD_LEVELS.find((l) => l.key === levelKey) || K.WORD_LEVELS[0];
    const spans = L.spans(word);
    const inSpan = (i) => spans.some(([a, b]) => i >= a && i < b);
    if (resp.length !== word.length) {
      let p = 0; const mn = Math.min(word.length, resp.length);
      while (p < mn && word[p] === resp[p]) p++;
      let s = 0; while (s < mn - p && word[word.length - 1 - s] === resp[resp.length - 1 - s]) s++;
      for (let i = p; i < Math.max(p + 1, word.length - s); i++) if (inSpan(i)) return "pattern_miss";
      return "missing_letter";
    }
    const diffs = [...word].map((c, i) => (c !== resp[i] ? i : -1)).filter((i) => i >= 0);
    if (diffs.some((i) => FLIP[word[i]] === resp[i])) return "letter_flip";
    if (spans.length && diffs.every(inSpan)) return "pattern_miss";
    if ([...word].sort().join("") === [...resp].sort().join("")) return "letter_order";
    if (diffs.every((i) => isVowel(word[i]) && isVowel(resp[i]))) return "vowel_mix";
    return "sound_swap";
  };

  // misspellings for "pick the right spelling" boss questions
  function misspellings(word, L) {
    const c = new Set();
    // pattern-based
    if (L.key === "silent_e") c.add(word.slice(0, -1));
    if (L.alt) for (const [k, v] of Object.entries(L.alt)) if (word.includes(k)) c.add(word.replace(k, v));
    if (L.key === "blends") { const sp = L.spans(word)[0]; if (sp && sp[1] - sp[0] >= 2) c.add(word.slice(0, sp[0] + 1) + word.slice(sp[0] + 2)); }
    const dbl = word.match(/([a-z])\1/); if (dbl) c.add(word.replace(dbl[0], dbl[1]));
    // vowel swap
    const vi = [...word].findIndex((ch, i) => isVowel(ch) && !(L.key === "silent_e" && i === word.length - 1));
    if (vi >= 0) c.add(word.slice(0, vi) + pick([...VOWELS].filter((v) => v !== word[vi])) + word.slice(vi + 1));
    // b/d flip
    const fi = [...word].findIndex((ch) => FLIP[ch]); if (fi >= 0) c.add(word.slice(0, fi) + FLIP[word[fi]] + word.slice(fi + 1));
    // adjacent swap
    const si = rand(1, word.length - 2); c.add(word.slice(0, si) + word[si + 1] + word[si] + word.slice(si + 2));
    c.delete(word);
    return shuffle([...c]).slice(0, 2);
  }
  K.makeSpellPick = (level) => {
    const L = K.WORD_LEVELS[level] || K.WORD_LEVELS[0];
    const [word, emoji] = pickFresh(L.words, 1, (w) => w[0])[0];
    const wrong = misspellings(word, L);
    return { type: "spell", word, emoji, level: L.key, answer: word, choices: shuffle([word, ...wrong]) };
  };

  // ---------------- Read & Pick ----------------
  // Riddles: [clues, answer, partial match (fits one clue), unrelated]
  const RIDDLES = [
    [ // tier 0
      ["I am big and gray. I have a long nose.", "🐘", "🦏", "🐸"],
      ["I am red. You can eat me.", "🍎", "🚒", "🐳"],
      ["I can fly. I make honey.", "🐝", "🐦", "🐶"],
      ["I am yellow. I am hot. I am up in the sky.", "☀️", "🍋", "🐟"],
      ["I have a shell. I am very slow.", "🐢", "🦀", "🚀"],
      ["I am a pet. I say woof.", "🐶", "🐱", "🌳"],
      ["I am cold and white. I fall from the sky.", "❄️", "🧊", "🔥"],
      ["I am green. I hop. I say ribbit.", "🐸", "🦗", "🚗"],
    ],
    [ // tier 1
      ["I live in the sea. I have eight arms.", "🐙", "🦀", "🐄"],
      ["I have black and white stripes. I look like a horse.", "🦓", "🐼", "🍌"],
      ["You wear me on your feet when it rains.", "👢", "🧦", "🎩"],
      ["I have a long neck. I eat leaves from tall trees.", "🦒", "🦢", "🐟"],
      ["I am a fruit. I am long and yellow.", "🍌", "🍋", "⚽"],
      ["I tell you the time. I hang on the wall.", "🕐", "📱", "🐻"],
      ["I am a bird. I cannot fly, but I can swim. I like the cold.", "🐧", "🦆", "🌵"],
      ["You can read me. I have lots of pages.", "📖", "📺", "🍕"],
    ],
    [ // tier 2
      ["I am a tool that cuts paper. I have two blades and two holes for your fingers.", "✂️", "🔪", "🎺"],
      ["I glow at night. Sometimes I am round, and sometimes I look like a banana.", "🌙", "💡", "🐙"],
      ["Firefighters ride on me. I am red and my siren is very loud.", "🚒", "🚑", "🦒"],
      ["I have wings, but I am not a bird. I start my life as a caterpillar.", "🦋", "🐦", "🍩"],
      ["I am a machine that flies. I have spinning blades on top instead of wings.", "🚁", "✈️", "🐄"],
      ["I am a sweet treat. I am cold, and I melt if you wait too long.", "🍦", "🍰", "🔨"],
      ["I live in the ocean, but I am not a fish. I breathe air, and I am the biggest animal on Earth.", "🐳", "🦈", "🌽"],
      ["You plant me as a tiny seed. I grow very tall, and my face follows the sun.", "🌻", "🌳", "🚲"],
    ],
  ];
  // Fill the gap: [sentence, answer, look-alike, doesn't-fit]
  const GAPS = [
    [
      ["The cat sat on the ___.", "mat", "map", "run"],
      ["I can ___ fast.", "run", "rug", "hat"],
      ["The sun is ___.", "hot", "hop", "cup"],
      ["A pig is in the ___.", "mud", "mug", "sit"],
      ["I see a big red ___.", "bus", "bud", "ran"],
      ["Dad has a ___ on his head.", "hat", "hut", "run"],
      ["The dog can ___ the ball.", "get", "jet", "red"],
      ["We had fun at the ___.", "park", "pork", "jump"],
    ],
    [
      ["The frog sat on a big green ___.", "leaf", "loaf", "jump"],
      ["I brush my teeth every ___.", "night", "might", "blue"],
      ["The boat sailed across the ___.", "lake", "like", "sing"],
      ["She put on her coat because it was ___.", "cold", "sold", "green"],
      ["The bird built a ___ in the tree.", "nest", "next", "swim"],
      ["I like to read a ___ before bed.", "book", "boot", "jump"],
      ["The baby fell asleep in her ___.", "crib", "crab", "loud"],
      ["We need a ___ to eat our soup.", "spoon", "spool", "tiger"],
    ],
    [
      ["We whispered so we would not wake the sleeping ___.", "puppy", "poppy", "quickly"],
      ["After the storm, a bright ___ appeared in the sky.", "rainbow", "rainboot", "swimming"],
      ["The astronaut zoomed into space in a ___.", "rocket", "pocket", "sleepy"],
      ["He was so thirsty that he drank three glasses of ___.", "water", "waiter", "purple"],
      ["The farmer planted ___ in the field.", "seeds", "sends", "happy"],
      ["My sister scraped her knee, so Mom put on a ___.", "bandage", "baggage", "loudly"],
      ["The penguin waddled across the slippery ___.", "snow", "show", "sang"],
      ["We could not play outside because it was ___ all day.", "raining", "training", "yellow"],
    ],
  ];
  K.makeReadQuestion = (tier) => {
    const t = Math.max(0, Math.min(2, tier | 0));
    const pool = [...RIDDLES[t].map((r) => ({ kind: "riddle", r })), ...GAPS[t].map((r) => ({ kind: "gap", r }))];
    const { kind, r } = pickFresh(pool, 1, (x) => x.r[0])[0];
    const [text, answer, near, other] = r;
    return { type: "read", kind, tier: t, text, answer, near, choices: shuffle([answer, near, other]) };
  };
  K.makeReadRound = (tier, n = 4) => Array.from({ length: n }, () => K.makeReadQuestion(tier));
  K.classifyReading = (q, picked, ms) => {
    if (picked === q.answer) return null;
    if (q.kind === "gap") return picked === q.near ? "look_alike" : "meaning";
    if (picked === q.near) return "missed_detail";
    return ms < 1500 ? "quick_tap" : "guess";
  };

  // ---------------- quick math (boss battles) ----------------
  K.makeMathQuick = (settings) => {
    const s = K.withDefaults(settings);
    const lo = s.max_sum > 10 ? 2 : 1;
    for (let i = 0; i < 200; i++) {
      const t = rand(lo * 2 + 1, s.max_sum), a = rand(lo, t - lo), b = t - a;
      if (b < lo || (!s.allow_cross_ten && K.crossesTen(a, b))) continue;
      const near = t + pick([-2, -1, 1, 2]);
      const third = [a, b, t + pick([-3, 3])].find((x) => x !== t && x !== near && x > 0);
      if (near < 1 || !third) continue;
      return { type: "math", target: t, addends: [a, b], answer: t, choices: shuffle([t, near, third]) };
    }
    return { type: "math", target: 5, addends: [2, 3], answer: 5, choices: shuffle([5, 4, 3]) };
  };
  K.classifyQuickMath = (q, picked, ms) => {
    if (picked === q.answer) return null;
    if (q.addends.includes(picked)) return "picked_addend";
    if (Math.abs(picked - q.answer) <= 2) return "counting_slip";
    return ms < 1500 ? "quick_tap" : "guess";
  };

  // ---------------- error labels & tips ----------------
  Object.assign(K.ERROR_TYPES, {
    letter_flip: { label: "Letter mix-up (b/d, p/q, m/n)", tip: "Very common at this age. Try the “bed” trick: make two fists with thumbs up — the left hand is b, the right hand is d." },
    pattern_miss: { label: "Missed the sound pattern", tip: "The mistake was inside this level's spelling pattern (sh, ai, silent e…). Practice a family of words that share it: rain, train, snail, mail." },
    letter_order: { label: "Right letters, wrong order", tip: "Say the word slowly, one sound at a time, and point to each letter in order as you say it." },
    vowel_mix: { label: "Vowel mix-up", tip: "Short vowels sound alike, especially e and i. Exaggerate them in pairs: pen / pin, bed / bad." },
    missing_letter: { label: "Missing or extra letter", tip: "Picked a spelling with a letter missing or added. Have them tap out each sound and check every sound has a letter." },
    sound_swap: { label: "Wrong consonant", tip: "Swapped a consonant. Say the word slowly and listen for each sound." },
    look_alike: { label: "Picked a look-alike word", tip: "Chose a word that looks almost the same (map vs mat). Encourage reading the whole word, especially the ending." },
    meaning: { label: "Word didn't fit the sentence", tip: "Picked a word that doesn't make sense. Have them re-read the sentence with their choice and ask: does that make sense?" },
    missed_detail: { label: "Missed a clue", tip: "Picked something that fits one clue but not all of them. Encourage reading every clue before tapping." },
  });
})();

// ---------------- adventure worlds ----------------
window.K.WORLDS = [
  { name: "Animal Forest", bg: "linear-gradient(#eaf5e2,#d4eac6)", deco: ["🌳","🌲","🍄","🦔","🌼","🐿️","🌳","🌲"], treat: "🍪",
    boss: { name: "Grumpy Storm Cloud", icon: "⛈️", friend: "🌤️", hat: "👑" } },
  { name: "Ocean Reef", bg: "linear-gradient(#e0f3fa,#bde3f0)", deco: ["🐠","🪸","🐚","🫧","🐡","🦀","🐠","🫧"], treat: "🫧",
    boss: { name: "Grouchy Squid", icon: "🦑", friend: "🦑", hat: "🎩" } },
  { name: "Dino Valley", bg: "linear-gradient(#f8eedc,#ecd7b4)", deco: ["🦕","🌴","🥚","🦴","🌿","🪨","🌴","🦖"], treat: "🍉",
    boss: { name: "Rumbly Volcano", icon: "🌋", friend: "🌋", hat: "🤠" } },
  { name: "Star Station", bg: "linear-gradient(#2c2f5a,#433d78)", dark: true, deco: ["⭐","🪐","🌟","☄️","🛰️","✨","⭐","🌟"], treat: "⭐",
    boss: { name: "Sneaky Space Alien", icon: "👾", friend: "👽", hat: "🎓" } },
];
window.K.worldOf = (i) => window.K.WORLDS[i % window.K.WORLDS.length];
