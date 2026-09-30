// The TV commentator: a line for the big moments, shown as a caption and
// (if the device can) spoken aloud. Uses the golfer's nickname when they
// have one.

const LINES = {
  bomb: ['That is a big, big drive!', 'Absolutely smashed it!', 'Right down the middle, and miles!', 'What a strike off the tee!'],
  fairway: ['Nicely done, that finds the fairway.', 'Good tee shot, in position.', 'Safely on the short grass.'],
  stiff: ['Oh, what a shot! That is stiff!', 'Right at the flag! Tap-in range!', 'That is a dart!', 'You could not hit it any closer!'],
  green: ['That finds the green.', 'Safely on the putting surface.', 'On in regulation. Nice.'],
  sand: ['Oh, that has found the sand.', 'Into the bunker. Tricky one.', 'Sandy lie coming up.'],
  water: ['Oh no, that is wet!', 'Splash! That one is in the water.', 'That is found the drink, I am afraid.'],
  ob: ['That is gone out of bounds.', 'Oh dear, that is out of bounds.'],
  lip: ['Oh! It lipped out!', 'So close! It horseshoed out!', 'How did that stay out?!'],
  ace: ['It is in! A hole in one!', 'Unbelievable! A hole in one!', 'Ace! Ace! The crowd goes wild!'],
  holeout: ['It is gone in! Holed it!', 'Wow! Straight in the cup!', 'You cannot teach that! In it goes!'],
  longputt: ['From way downtown! It drops!', 'What a putt! Right in the heart!', 'Monster putt! It is in!'],
  eagle: ['Eagle! Brilliant golf!', 'An eagle! Fantastic!'],
  birdie: ['Birdie! Lovely stuff.', 'That is a birdie.', 'Another one under par!'],
  bogey: ['A dropped shot there.', 'Bogey. You will want that one back.'],
  rough: ['That is in the rough.', 'Just missed the fairway.'],
  win: ['And that is the championship!', 'A champion is crowned!'],
};

let last = 0;
let voice = null;

function pickVoice() {
  if (voice || typeof speechSynthesis === 'undefined') return voice;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|arthur/i.test(v.name)) || vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  return voice;
}

export function commentLine(kind, name = '', seed = Math.random()) {
  const list = LINES[kind];
  if (!list) return '';
  let line = list[Math.floor(seed * list.length) % list.length];
  // sometimes use the player's name or nickname
  if (name && seed > 0.55 && !/crowd/i.test(line)) line = `${name}! ${line}`;
  return line;
}

// Say a line (rate-limited so it never talks over itself)
export function speak(text, { voiceOn = true, force = false } = {}) {
  const now = performance.now();
  if (!text || (!force && now - last < 2600)) return false;
  last = now;
  if (voiceOn && typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined') {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.06;
      u.pitch = 0.92;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* no speech on this device */ }
  }
  return true;
}

export function quiet() {
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}
