// XQL Tutor - spaced repetition scheduler (SM-2 style) and progress persistence
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const KEY = 'xql-tutor:v1';
  const DAY = 86400000;
  const GRADES = { again: 0, hard: 3, good: 4, easy: 5 };

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
    return { cards: {}, log: [], settings: { newPerSession: 6, reviewLimit: 14 }, streak: { days: 0, last: null } };
  }
  function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  class SRS {
    constructor() { this.state = load(); this.state.settings = Object.assign({ newPerSession: 6, reviewLimit: 14 }, this.state.settings || {}); }
    card(id) { return this.state.cards[id] || null; }
    now() { return Date.now(); }

    // Record an answer. gradeName: again | hard | good | easy. Returns the updated card.
    grade(id, gradeName, meta) {
      const q = GRADES[gradeName];
      const now = this.now();
      const c = this.state.cards[id] || { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: now, seen: 0, history: [] };
      c.seen++;
      c.lastGrade = gradeName;
      c.lastAt = now;
      if (q < 3) {
        c.reps = 0; c.lapses++; c.interval = 0;
        c.due = now + 10 * 60000; // come back in ten minutes
      } else {
        if (c.reps === 0) c.interval = q === 5 ? 3 : 1;
        else if (c.reps === 1) c.interval = q === 5 ? 7 : q === 4 ? 3 : 2;
        else c.interval = Math.max(1, Math.round(c.interval * (q === 3 ? 1.2 : q === 4 ? c.ef : c.ef * 1.3)));
        c.reps++;
        c.due = now + c.interval * DAY;
      }
      c.ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      c.history = (c.history || []).slice(-19).concat([{ at: now, g: gradeName, ok: meta && meta.correct ? 1 : 0 }]);
      this.state.cards[id] = c;
      this.state.log.push({ id, at: now, g: gradeName, ok: meta && meta.correct ? 1 : 0, type: meta && meta.type, concept: meta && meta.concept });
      if (this.state.log.length > 2000) this.state.log = this.state.log.slice(-2000);
      this.touchStreak(now);
      save(this.state);
      return c;
    }

    touchStreak(now) {
      const today = new Date(now).toISOString().slice(0, 10);
      const s = this.state.streak || { days: 0, last: null };
      if (s.last === today) return;
      const yesterday = new Date(now - DAY).toISOString().slice(0, 10);
      s.days = s.last === yesterday ? s.days + 1 : 1;
      s.last = today;
      this.state.streak = s;
    }

    isDue(id, now) { const c = this.card(id); return !!c && c.due <= (now || this.now()); }
    dueIds(now) { now = now || this.now(); return Object.keys(this.state.cards).filter((id) => this.state.cards[id].due <= now).sort((a, b) => this.state.cards[a].due - this.state.cards[b].due); }
    nextDueAt() { const ds = Object.values(this.state.cards).map((c) => c.due).filter((d) => d > this.now()); return ds.length ? Math.min(...ds) : null; }

    // 0..1 strength of a card for mastery bars
    strength(id) {
      const c = this.card(id);
      if (!c) return 0;
      if (c.lastGrade === 'again') return 0.15;
      return Math.min(1, 0.3 + (c.interval / 10) * 0.7);
    }
    conceptMastery(exercises) {
      if (!exercises.length) return 0;
      return exercises.reduce((a, e) => a + this.strength(e.id), 0) / exercises.length;
    }
    stats(exercises) {
      const cards = this.state.cards;
      const seen = exercises.filter((e) => cards[e.id]).length;
      const mastered = exercises.filter((e) => this.strength(e.id) >= 0.8).length;
      const log = this.state.log;
      const recent = log.slice(-50);
      const accuracy = recent.length ? recent.filter((l) => l.ok).length / recent.length : null;
      const today = new Date().toISOString().slice(0, 10);
      const todayCount = log.filter((l) => new Date(l.at).toISOString().slice(0, 10) === today).length;
      const due = exercises.filter((e) => this.isDue(e.id)).length; // ignore cards whose exercise no longer exists
      return { seen, mastered, total: exercises.length, due, accuracy, todayCount, streak: this.state.streak ? this.state.streak.days : 0, answered: log.length };
    }

    // Build an interleaved session: due cards first (shuffled across concepts), then new cards from the earliest unfinished unit.
    buildSession(exercises, opts) {
      opts = opts || {};
      const limit = opts.reviewLimit || this.state.settings.reviewLimit;
      const newCount = opts.newPerSession != null ? opts.newPerSession : this.state.settings.newPerSession;
      const byId = new Map(exercises.map((e) => [e.id, e]));
      const due = this.dueIds().map((id) => byId.get(id)).filter(Boolean);
      const picked = interleave(due).slice(0, limit);
      if (newCount > 0 && picked.length < limit + newCount) {
        const unseen = exercises.filter((e) => !this.state.cards[e.id]);
        picked.push(...unseen.slice(0, newCount));
      }
      return picked;
    }

    reset() { this.state = { cards: {}, log: [], settings: this.state.settings, streak: { days: 0, last: null } }; save(this.state); }
    exportJSON() { return JSON.stringify(this.state, null, 2); }
    importJSON(text) { const s = JSON.parse(text); if (!s || typeof s !== 'object' || !s.cards) throw new Error('Not a tutor progress file'); this.state = s; save(this.state); }
    setSetting(k, v) { this.state.settings[k] = v; save(this.state); }
  }

  // Round-robin across concepts so a review session mixes topics (interleaving).
  function interleave(items) {
    const buckets = new Map();
    for (const it of items) { const k = it.concept; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(it); }
    for (const b of buckets.values()) shuffle(b);
    const out = [];
    let any = true;
    while (any) { any = false; for (const b of buckets.values()) if (b.length) { out.push(b.shift()); any = true; } }
    return out;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  XQL.SRS = SRS;
  XQL.shuffle = shuffle;
  XQL.interleave = interleave;
})(typeof globalThis !== 'undefined' ? globalThis : this);
