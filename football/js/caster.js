/* Gridiron Kings — play-by-play announcer. Uses the browser's built-in speech voice when there is
   one, and always shows the call as a caption. Silent if speech is unavailable. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const C = { on: true, voice: null, last: 0, lastText: '', busyUntil: 0, onCaption: null };
  const synth = (() => { try { return window.speechSynthesis || null; } catch (e) { return null; } })();

  function pickVoice() {
    if (!synth) return;
    let vs = [];
    try { vs = synth.getVoices() || []; } catch (e) { vs = []; }
    const en = vs.filter((v) => /^en[-_]/i.test(v.lang || ''));
    const pref = ['Daniel', 'Google US English', 'Alex', 'Aaron', 'Fred', 'Microsoft Guy', 'Microsoft David', 'Male'];
    C.voice = null;
    for (const name of pref) { const v = en.find((x) => x.name.indexOf(name) >= 0); if (v) { C.voice = v; break; } }
    if (!C.voice) C.voice = en.find((v) => /en[-_]US/i.test(v.lang)) || en[0] || null;
  }
  if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) { /* older browsers */ } }

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const last = (name) => String(name || '').replace(/^[A-Z]\.\s*/, '');
  const fill = (t, d) => t.replace(/\{(\w+)\}/g, (_, k) => (d[k] != null ? d[k] : ''));

  /* prio: 3 = big moment (cuts off anything), 2 = normal, 1 = filler (skipped if busy) */
  C.say = function (text, prio) {
    if (!text) return;
    const now = performance.now();
    if (prio < 3 && now < C.busyUntil && prio <= 1) return;
    if (text === C.lastText && now - C.last < 4000) return;
    C.last = now; C.lastText = text;
    if (!C.on) return;
    if (C.onCaption) C.onCaption(text);
    if (!synth) return;
    try {
      if (prio >= 2 || now >= C.busyUntil) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (C.voice) u.voice = C.voice;
      u.rate = prio >= 3 ? 1.12 : 1.04; u.pitch = prio >= 3 ? 1.05 : 0.95; u.volume = 1;
      synth.speak(u);
      C.busyUntil = now + 450 + text.length * 62;
    } catch (e) { /* speech can fail on some devices */ }
  };
  C.stop = function () { try { if (synth) synth.cancel(); } catch (e) { /* ignore */ } C.busyUntil = 0; };
  C.setOn = function (on) { C.on = !!on; if (!on) C.stop(); };

  const L = {
    intro: ['Welcome to tonight\'s game. {home} take on {away}!', 'Good evening, football fans! It\'s {home} against {away}.', 'The stadium is packed. {home} and {away}, let\'s play some football!'],
    snow: ['And the snow is coming down out there.', 'It\'s a snow game tonight. Watch the footing.'],
    rain: ['Rain is falling, so hang on to that football.', 'Wet conditions tonight. The ball will be slippery.'],
    td: ['Touchdown! {name}!', 'He\'s in! Touchdown, {team}!', 'Six points! What a play by {name}!', 'Into the end zone! Touchdown!'],
    tdLong: ['He\'s gone! {yds} yards! Touchdown, {name}!', 'Nobody\'s catching him! {yds}-yard touchdown!'],
    tdPass: ['Caught for the touchdown! {name}!', 'What a throw, and {name} hauls it in for six!'],
    pick6: ['Picked off, and he\'s taking it back! Pick six!', 'Intercepted, and {name} goes all the way!'],
    int: ['Intercepted! {name} jumps the route!', 'Picked off by {name}!', 'Oh, that\'s an interception!'],
    sack: ['Sacked! {by} gets home!', 'Down goes the quarterback!', '{by} with the sack!'],
    bigGain: ['Look at him go! A gain of {g}!', 'He breaks free! That\'s a big play!', 'What a play! {g} yards!'],
    catchFd: ['Caught, and that\'s a first down.', '{name} with the grab. Moving the chains!'],
    runFd: ['He fights for the first down.', 'And that\'s enough for a first down.'],
    incomplete: ['Incomplete.', 'The pass falls incomplete.', 'No good, incomplete.'],
    breakup: ['Knocked away by {name}!', 'Great coverage! Pass broken up.'],
    drop: ['Dropped! He had it in his hands!', 'Oh, he can\'t hang on.'],
    loss: ['Stopped behind the line!', 'Dropped for a loss.'],
    bigHit: ['Oh! What a hit by {name}!', 'Boom! {name} lays the wood!'],
    truck: ['He runs right over him!', 'Trucked! {name} won\'t go down!'],
    broken: ['He breaks the tackle!', 'Slips out of the tackle!'],
    juke: ['Nice move!'],
    fgGood: ['The kick is up, and it\'s good!', 'Right down the middle. Three points!'],
    fgMiss: ['The kick is no good!', 'Wide! He misses it!'],
    punt: ['Here\'s the punt.'],
    downs: ['They come up short. Turnover on downs.'],
    safety: ['That\'s a safety! Two points!'],
    flag: ['Flag on the play. Delay of game.', 'The play clock ran out. Five-yard penalty.'],
    half: ['That\'s halftime. {score}.'],
    final: ['That\'s the ball game! {winner} win it, {score}.', 'The final whistle! {winner} take it, {score}.'],
    tie: ['It ends in a tie, {score}.'],
    quarter: ['That\'s the end of the quarter. {score}.'],
    replay: ['Let\'s take another look at that.', 'Here\'s the replay.'],
  };
  C.line = function (key, d, prio) { const a = L[key]; if (a) C.say(fill(pick(a), d || {}), prio || 2); };

  function scoreText(m) {
    const a = m.teams[0], b = m.teams[1];
    if (m.score[0] === m.score[1]) return 'tied at ' + m.score[0];
    const lead = m.score[0] > m.score[1] ? a : b;
    return lead.name + ' ' + Math.max(m.score[0], m.score[1]) + ' to ' + Math.min(m.score[0], m.score[1]);
  }
  C.startGame = function (m, weather) {
    C.line('intro', { home: m.teams[0].name, away: m.teams[1].name }, 2);
    if (weather === 'snow' || weather === 'rain') setTimeout(() => C.line(weather, {}, 1), 3600);
  };

  C.handle = function (e, m) {
    const d = e.data || {};
    switch (e.type) {
      case 'td': {
        const team = m.teams[d.team] ? m.teams[d.team].name : '';
        const k = d.pick ? 'pick6' : d.yds >= 30 ? 'tdLong' : d.pass ? 'tdPass' : 'td';
        C.line(k, { name: last(d.name), team, yds: d.yds }, 3);
        break;
      }
      case 'int': C.line('int', { name: last(d.name) }, 3); break;
      case 'tackle': if (d.big) C.line('bigHit', { name: last(d.name) }, 2); break;
      case 'broken': if (d.truck) C.line('truck', { name: last(d.name) }, 2); else if (Math.random() < 0.5) C.line('broken', {}, 1); break;
      case 'drop': C.line('drop', {}, 2); break;
      case 'breakup': C.line('breakup', { name: last(d.name) }, 2); break;
      case 'fg': C.line(d.good ? 'fgGood' : 'fgMiss', {}, 3); break;
      case 'safety': C.line('safety', {}, 3); break;
      case 'flag': C.line('flag', {}, 2); break;
      case 'result': {
        if (d.kind === 'sack') { C.line('sack', { by: last(d.by) || 'the defense' }, 2); break; }
        if (d.kind === 'incomplete') { if (Math.random() < 0.55) C.line('incomplete', {}, 1); break; }
        if (d.sub === 'Turnover on downs') { C.line('downs', {}, 2); break; }
        if (d.kind === 'penalty' || d.kind === 'fg' || d.kind === 'punt') break;
        if (d.gain >= 18) C.line('bigGain', { g: d.gain }, 2);
        else if (d.firstDown) C.line(d.pass ? 'catchFd' : 'runFd', { name: last(d.name) }, 1);
        else if (d.gain < 0) C.line('loss', {}, 1);
        break;
      }
      case 'banner':
        if (d.text === 'Halftime') C.line('half', { score: scoreText(m) }, 2);
        else if (/^End of Q/.test(d.text || '')) C.line('quarter', { score: scoreText(m) }, 1);
        break;
      case 'final': {
        const tie = m.score[0] === m.score[1];
        const w = m.score[0] > m.score[1] ? m.teams[0] : m.teams[1];
        C.line(tie ? 'tie' : 'final', { winner: w.name, score: m.score[0] > m.score[1] ? m.score[0] + ' to ' + m.score[1] : m.score[1] + ' to ' + m.score[0] }, 3);
        break;
      }
    }
  };

  FG.caster = C;
})();
