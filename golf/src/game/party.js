// Play with friends on one device: 2-4 players share the course, taking
// turns the way golfers do (honors on the tee, then whoever is farthest from
// the hole). Three formats: stroke play (lowest total), match play (two
// players, hole by hole) and skins (each hole is worth a skin; ties carry
// the skins over to the next hole).

export const PARTY_COLORS = ['#f2c230', '#3a86ff', '#ff5fa2', '#7fd05a'];
export const FORMATS = {
  stroke: { name: 'Stroke play', desc: 'Every shot counts. Lowest total wins.' },
  match: { name: 'Match play', desc: 'Two players, hole by hole. Win more holes than your opponent.' },
  skins: { name: 'Skins', desc: 'Each hole is worth a skin. Win a hole outright to take it; ties carry the skins over.' },
};

export class Party {
  constructor(players, format, course, holeList) {
    this.players = players.map((p, i) => ({ ...p, i, color: p.color || PARTY_COLORS[i], scores: [], holeStats: [], skins: 0, st: null }));
    this.format = format === 'match' && players.length !== 2 ? 'stroke' : format;
    this.course = course;
    this.holeList = holeList;
    this.carry = 0; // skins waiting on the next hole
    this.log = []; // per-hole summary lines
    this.matchUp = 0; // + = player 0 ahead (match play)
    this.decided = null;
    this.order = this.players.map((p) => p.i);
    this.teed = new Set();
  }

  get n() { return this.players.length; }

  // New hole: everybody on the tee; honors from the last hole go first
  startHole(holeIndex) {
    this.hole = holeIndex;
    this.teed = new Set();
    const prev = this.lastHole;
    if (prev != null) {
      const sc = (p) => p.scores[prev] ?? 99;
      // stable: best score on the last hole first, previous order breaks ties
      const idx = new Map(this.order.map((id, k) => [id, k]));
      this.order = [...this.order].sort((a, b) => sc(this.players[a]) - sc(this.players[b]) || idx.get(a) - idx.get(b));
    }
  }

  // Who plays next: tee shots in honor order, then the farthest from the hole
  next(distOf) {
    for (const id of this.order) {
      const p = this.players[id];
      if (!this.teed.has(id) && !p.st.done) return id;
    }
    let best = -1, bd = -1;
    for (const id of this.order) {
      const p = this.players[id];
      if (p.st.done) continue;
      const d = distOf(p);
      if (d > bd) { bd = d; best = id; }
    }
    return best;
  }

  allDone() { return this.players.every((p) => p.st.done); }

  holeFinished(holeIndex, par) {
    this.lastHole = holeIndex;
    const sc = this.players.map((p) => p.scores[holeIndex]);
    const low = Math.min(...sc);
    const winners = this.players.filter((p) => p.scores[holeIndex] === low);
    let line = '';
    if (this.format === 'skins') {
      const pot = 1 + this.carry;
      if (winners.length === 1) {
        winners[0].skins += pot;
        line = `${winners[0].name} wins ${pot} skin${pot > 1 ? 's' : ''}`;
        this.carry = 0;
      } else {
        this.carry = pot;
        line = `Tied: ${pot} skin${pot > 1 ? 's' : ''} carry over`;
      }
    } else if (this.format === 'match') {
      const [a, b] = this.players;
      if (a.scores[holeIndex] < b.scores[holeIndex]) { this.matchUp++; line = `${a.name} wins the hole`; }
      else if (b.scores[holeIndex] < a.scores[holeIndex]) { this.matchUp--; line = `${b.name} wins the hole`; }
      else line = 'Hole halved';
      const left = this.holesLeft(holeIndex);
      if (Math.abs(this.matchUp) > left) {
        const w = this.matchUp > 0 ? a : b;
        this.decided = { winner: w.i, text: `${w.name} wins ${Math.abs(this.matchUp)}${left ? `&${left}` : ' up'}` };
        line += ` · ${this.decided.text}`;
      } else line += ` · ${this.matchText()}`;
    } else {
      line = winners.length === 1 ? `${winners[0].name} wins the hole` : 'Hole shared';
    }
    this.log.push({ hole: holeIndex, line, par, scores: sc });
    return line;
  }

  holesLeft(holeIndex) {
    const k = this.holeList.indexOf(holeIndex);
    return this.holeList.length - 1 - k;
  }

  matchText() {
    if (this.format !== 'match') return '';
    const [a, b] = this.players;
    if (this.matchUp === 0) return 'All square';
    return `${this.matchUp > 0 ? a.name : b.name} ${Math.abs(this.matchUp)} up`;
  }

  toPar(p) {
    let s = 0, par = 0;
    p.scores.forEach((v, i) => { if (v != null) { s += v; par += this.course.holes[i].par; } });
    return s - par;
  }

  total(p) { return p.scores.reduce((a, v) => a + (v || 0), 0); }
  thru(p) { return p.scores.filter((v) => v != null).length; }

  // Standings for the HUD strip and the results
  standings() {
    const rows = this.players.map((p) => ({ i: p.i, name: p.name, color: p.color, toPar: this.toPar(p), total: this.total(p), thru: this.thru(p), skins: p.skins }));
    if (this.format === 'skins') rows.sort((a, b) => b.skins - a.skins || a.total - b.total);
    else if (this.format === 'match') rows.sort((a, b) => (this.matchUp >= 0 ? a.i - b.i : b.i - a.i));
    else rows.sort((a, b) => a.toPar - b.toPar);
    let pos = 0, prev = null;
    rows.forEach((r, k) => {
      const key = this.format === 'skins' ? r.skins : this.format === 'match' ? k : r.toPar;
      if (prev === null || key !== prev) pos = k + 1;
      prev = key;
      r.pos = pos;
    });
    return rows;
  }

  over() { return !!this.decided; }

  // Final result: who won and how
  final() {
    const rows = this.standings();
    let title, winners;
    if (this.format === 'match') {
      if (this.decided) { winners = [this.decided.winner]; title = this.decided.text; }
      else if (this.matchUp === 0) { winners = [0, 1]; title = 'Match halved'; }
      else { const w = this.matchUp > 0 ? 0 : 1; winners = [w]; title = `${this.players[w].name} wins ${Math.abs(this.matchUp)} up`; }
    } else if (this.format === 'skins') {
      const top = rows[0].skins;
      winners = rows.filter((r) => r.skins === top).map((r) => r.i);
      title = winners.length > 1 ? `Tied on ${top} skin${top === 1 ? '' : 's'}` : `${this.players[winners[0]].name} wins with ${top} skin${top === 1 ? '' : 's'}`;
    } else {
      const top = rows[0].toPar;
      winners = rows.filter((r) => r.toPar === top).map((r) => r.i);
      title = winners.length > 1 ? 'A tie at the top!' : `${this.players[winners[0]].name} wins`;
    }
    return { title, winners, rows, format: this.format, log: this.log };
  }
}
