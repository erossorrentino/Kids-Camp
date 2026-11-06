// All written content: dialogue trees and quest definitions.
// Speakers: node.s (omitted = the NPC you are talking to, '' = narration, 'you' = the player).
import { G } from '../core/G.js';

const flag = (S, f) => !!S.flags[f];
const shards = (S) => (S.inv.shardDawn ? 1 : 0) + (S.inv.shardEmber ? 1 : 0) + (S.inv.shardStar ? 1 : 0);

export const DIALOGUES = {
  // ------------------------------------------------------------ prologue
  lyra_intro: {
    nodes: {
      start: { t: 'Oh! You’re awake. Thank the stars. I found you face-down by the lake shore, and that thing on your wrist was humming like a hive of bees.', next: 'a' },
      a: {
        t: 'I’m Lyra. Apprentice astronomer, Hearthmere’s only one, which makes me also the best. Who are you? Where did you come from?',
        choices: [
          { t: 'I… don’t remember. Thank you for finding me.', tag: 'Kind', next: 'kind', fx: { aff: { lyra: 5 } } },
          { t: 'Where am I? What is this place?', tag: 'Guarded', next: 'guard' },
          { t: 'What is that tower in the lake?', tag: 'Curious', next: 'tower', fx: { aff: { lyra: 3 } } },
        ],
      },
      kind: { t: 'You don’t remember anything? Not even your name? Well. Everyone in Hearthmere will call you “the Wayfarer” by supper anyway. It suits you.', next: 'device' },
      guard: { t: 'Meadowvale, near the village of Hearthmere. That glittering water is Mirror Lake. And you are, apparently, a very suspicious person who sleeps in mud.', next: 'device' },
      tower: { t: 'The Chrono Spire. They say it holds the Heart of Time, the thing that keeps the days in order. Lately the stars over it have been… skipping. Like a song with a scratched note.', next: 'device' },
      device: { t: 'That bracelet of yours. It’s an astrolabe, but older than any I’ve read about. The rings move on their own. Elder Maren will want to see it. Come to Hearthmere with me?', next: 'b' },
      b: {
        choices: [
          { t: 'Lead the way.', next: 'end', fx: { aff: { lyra: 2 } } },
          { t: 'I can manage on my own, but I’ll come.', next: 'end' },
        ],
      },
      end: { t: 'It’s just down the road, south-west. Mind the wolves, they’ve been bold this season. I’ll meet you in the square!', end: true, fx: { flag: 'met_lyra' } },
    },
  },
  maren_intro: {
    nodes: {
      start: { t: 'So you are the one Lyra fished out of the lake. Let me see that wrist, child.', next: 'a' },
      a: { s: '', t: 'The old woman turns the astrolabe in the light. Its rings shiver and point, every one of them, at the Spire.', next: 'b' },
      b: { t: 'Timeborn. The old songs spoke of travellers who belonged to no single hour. I thought them stories for children who wouldn’t sleep.', next: 'c' },
      c: {
        t: 'Whatever you are, you arrive at a hard time. Thornlings, bramble-folk that should never leave the deep wood, have taken root by our south fields. Our farmers can’t harvest.',
        choices: [
          { t: 'I’ll deal with them.', tag: 'Brave', next: 'yes', fx: { flag: 'talked_maren' } },
          { t: 'What’s in it for me?', tag: 'Blunt', next: 'pay', fx: { flag: 'talked_maren' } },
        ],
      },
      pay: { t: 'A roof, a meal, and an old woman’s answers about the thing on your arm. Answers are worth more than coin, Wayfarer.', next: 'yes' },
      yes: { t: 'The nest is just south of the fields. Strike when they telegraph a swing, or meet the blow with your guard at the very last instant. A clean parry will leave them reeling.', end: true },
    },
  },
  maren_thanks: {
    nodes: {
      start: { t: 'The fields are quiet again. You fight like someone who has done it a thousand times, and forgotten every one.', next: 'a' },
      a: { t: 'Go and see Lyra at the observatory. She has been muttering about the Dawnwatch Pillar all morning. If anyone can read what your astrolabe wants, it is that girl.', end: true, fx: { flag: 'maren_thanks', xp: 40 } },
    },
  },
  lyra_pillar: {
    nodes: {
      start: { t: 'You’re back, and in one piece! Listen. Last night the stars above the Spire went out for exactly eleven heartbeats. I counted.', next: 'a' },
      a: { t: 'The Dawnwatch Pillar is the oldest star-seat in Meadowvale. From the top you can see the whole sky. If your astrolabe is a key, that pillar might be the lock.', next: 'b' },
      b: {
        t: 'It’s south-east of the village. It’s tall, so you’ll have to climb. Watch your stamina, and rest on the ledges.',
        choices: [
          { t: 'Come with me.', next: 'come', fx: { aff: { lyra: 2 } } },
          { t: 'Stay here where it’s safe.', next: 'safe', fx: { aff: { lyra: -2 } } },
        ],
      },
      come: { t: 'I’d slow you down on the climb. But I’ll be watching through my telescope, so don’t fall off. That would be embarrassing for both of us.', end: true, fx: { flag: 'lyra_pillar' } },
      safe: { t: 'Safe. Right. You sound like my mother. Fine, I’ll watch through the telescope. Go!', end: true, fx: { flag: 'lyra_pillar' } },
    },
  },
  // ------------------------------------------------------------ Age of Ash
  kael_intro: {
    nodes: {
      start: { t: 'Stop right there. Hands where I can see them. Nobody walks out of the ash-fields alive, so either you’re a husk wearing a face, or you’ve got a story.', next: 'a' },
      a: {
        choices: [
          { t: 'I was in Hearthmere a moment ago. It was green. People were singing.', tag: 'Honest', next: 'honest', fx: { aff: { kael: 3 } } },
          { t: 'Lower your sword, knight.', tag: 'Firm', next: 'firm', fx: { aff: { kael: 5 } } },
          { t: 'Where is everyone? What happened here?', tag: 'Worried', next: 'worry' },
        ],
      },
      honest: { t: 'Green. Singing. Hearthmere’s been ash for a thousand years. Either you’re mad, or…', next: 'b' },
      firm: { t: 'Hah. You’ve got a spine. Fine. But one wrong move and you’re on the ground.', next: 'b' },
      worry: { t: 'Happened? The Sundering happened. The Heart of Time broke, the sky burned, and the world’s been dying slowly ever since.', next: 'b' },
      b: { s: '', t: 'His eyes drop to the astrolabe. He swears softly.', next: 'c' },
      c: { t: 'That’s a Timeborn’s brand. Sela told stories about those. Kael Ironwood, Iron Covenant, or what’s left of it. Go talk to Sela by the fire. If she says you’re real, you’re real.', end: true, fx: { flag: 'met_kael' } },
    },
  },
  sela_intro: {
    nodes: {
      start: { t: 'A Timeborn. In my lifetime. Sit, sit. I am Sela, keeper of the Verdant Circle, those of us who still plant seeds in ash.', next: 'a' },
      a: { t: 'A thousand years ago someone tried to seize the Heart of Time at the Chrono Spire. The Heart shattered into three Shards, and time itself split into Ages that bleed into one another.', next: 'b' },
      b: { t: 'You came here from the Age of Bloom, before the Sundering. The astrolabe pulled you forward. But you can go back. You can go anywhere the Shards remember.', next: 'c' },
      c: { t: 'Hold the astrolabe to the sky and remember the place you love. Press T to turn its rings, or hold T to choose an Age.', next: 'd', fx: { flag: 'shift_unlocked' } },
      d: {
        t: 'Go back. Warn them if you can. And when you are ready, come and find us again. We will be here. We are always here.',
        choices: [
          { t: 'Can I change what happened?', next: 'change' },
          { t: 'I’ll come back. I promise.', next: 'promise', fx: { faction: { verdant: 5 } } },
        ],
      },
      change: { t: 'Every choice you make in one Age ripples into the others. Plant a seed, and a tree may shade us here. Be careful what you plant, Wayfarer.', end: true },
      promise: { t: 'Then go with the Circle’s blessing.', end: true },
    },
  },
  lyra_return: {
    nodes: {
      start: { t: 'Wayfarer! The whole sky flashed white and you vanished from the pillar. Where did you GO?', next: 'a' },
      a: {
        choices: [
          { t: 'A thousand years ahead. Hearthmere is ash.', tag: 'Truth', next: 'truth', fx: { aff: { lyra: 4 } } },
          { t: 'Somewhere far away. I’d rather not say.', tag: 'Gentle', next: 'gentle' },
        ],
      },
      truth: { t: '…Ash. All of it? The tower, the bakery, Old Hob’s turnips? No. No, I believe you. I’ve seen the stars skipping. I knew something was coming.', next: 'b' },
      gentle: { t: 'Your face says plenty. Something terrible, then. Something that hasn’t happened yet.', next: 'b' },
      b: { t: 'If Hearthmere falls, everything we’ve learned about the Heart goes with it. My star charts, my journal, years of notes. Someone in the future has to have them.', next: 'c' },
      c: {
        t: 'Should I bury my journal beneath the observatory, or send it east with the pilgrims to Kestrel’s Rest? You’ve seen the future. You choose.',
        choices: [
          { t: 'Bury it under the observatory.', next: 'bury', fx: { flag: 'journal_buried', aff: { lyra: 3 } } },
          { t: 'Send it to Kestrel’s Rest.', next: 'send', fx: { flag: 'journal_sent' } },
        ],
      },
      bury: { t: 'Under the tower, then, wrapped in wax cloth. If anyone ever digs there, they’ll find it. I hope it’s someone kind.', next: 'end' },
      send: { t: 'East it goes, with Brother Aldo’s caravan. Kestrel’s Rest has stone walls. It will be safe there.', next: 'end' },
      end: { t: 'Go see Elder Maren. If you can travel through time, she’ll want to talk about the Heart.', end: true, fx: { flag: 'told_lyra', xp: 60 } },
    },
  },
  maren_shards: {
    nodes: {
      start: { t: 'So it is true. A Timeborn walks among us, and the end of our world sits a thousand years down the road.', next: 'a' },
      a: { t: 'Listen well. The Heart of Time was guarded by three Wardens. When the Heart shatters, each Shard will flee to its Warden, and each Warden will hold it in a different Age.', next: 'b' },
      b: { t: 'Varok, the Gilded Sentinel, keeps the Shard of Dawn in our own time, in the Gilded Ring among the red mesas to the west.', next: 'c' },
      c: { t: 'The Shard of Embers will burn atop Cinderpeak in the Age of Ash. And the Shard of Stars… it will rise into the sky above the Thornwood, in an Age none of us will live to see.', next: 'd' },
      d: { t: 'Gather all three and bring them to the Spire. Perhaps the Heart can be mended. Perhaps it can be used for something worse. That will be your choice, child, not mine.', next: 'e' },
      e: { t: 'Take this as well. A Sunheart seed. Plant it on the hill north of the village and the Ages to come will thank you.', end: true, fx: { flag: 'maren_shards', give: { seed: 1 }, quest: 'seed', xp: 50 } },
    },
  },
  maren_idle: {
    nodes: {
      start: {
        t: (S) => (shards(S) ? `You carry ${shards(S)} of the three Shards. I can feel them humming from here.` : 'Seek the Wardens, child. The Gilded Ring is closest, to the west.'),
        choices: [
          { t: 'Tell me about the Chronarch.', next: 'chron', cond: (S) => flag(S, 'maren_shards') },
          { t: 'Farewell.', end: true },
        ],
      },
      chron: { t: 'The Chronarch was the Spire’s first guardian. They loved the world so much they wanted to keep it exactly as it was, forever. A frozen flower is still a dead one.', end: true },
    },
  },
  // ------------------------------------------------------------ the grain dilemma (Ash)
  voss: {
    nodes: {
      start: {
        redirect: (S) => (flag(S, 'grain_done') ? 'after' : flag(S, 'grain_started') ? 'ask' : 'intro'),
      },
      intro: { t: 'Captain Voss, Iron Covenant. You must be Kael’s Timeborn. Good. I need someone the refugees will listen to.', next: 'ask0' },
      ask0: { t: 'My soldiers hold the line against the husks. They are starving. The Verdant Circle sits on the last grain in the valley and won’t share it.', next: 'ask', fx: { flag: 'grain_started', quest: 'grain' } },
      ask: {
        t: 'Convince Sela to hand over the grain, or I will take it. Whose side are you on?',
        choices: [
          { t: 'Your soldiers protect everyone. They should eat. I’ll get you the grain.', tag: 'Covenant', next: 'cov', fx: { faction: { covenant: 20, verdant: -10 }, aff: { kael: 8 }, flags: { grain_covenant: true, grain_done: true }, advance: 'grain' } },
          { t: 'Those people are starving too. Take what you need and you’ll have nothing left to protect.', tag: 'Verdant', next: 'ver', fx: { faction: { verdant: 20, covenant: -10 }, aff: { kael: -5 }, flags: { grain_verdant: true, grain_done: true }, advance: 'grain' } },
          { t: 'Split it. Half to the soldiers, half to the families, and I’ll hunt to make up the rest.', tag: 'Fair', next: 'split', fx: { faction: { verdant: 8, covenant: 8 }, aff: { kael: 4 }, flags: { grain_split: true, grain_done: true }, advance: 'grain' } },
        ],
      },
      cov: { t: 'Finally, someone who understands duty. When the time comes, the Covenant will march at your side.', end: true, fx: { xp: 80 } },
      ver: { t: 'Then my soldiers go hungry, and the walls fall that much sooner. I hope your conscience keeps you warm, Timeborn.', end: true, fx: { xp: 80 } },
      split: { t: 'Hah. Neither side will be happy. That usually means it’s fair. Very well.', end: true, fx: { xp: 80 } },
      after: { t: (S) => (S.flags.grain_covenant ? 'The soldiers eat, and the walls hold. The Covenant is in your debt.' : S.flags.grain_verdant ? 'We’re making do. Barely. Go do whatever it is Timeborn do.' : 'Half-rations for everyone. We will survive. Probably.'), end: true },
    },
  },
  // ------------------------------------------------------------ companions
  kael_hub: {
    nodes: {
      start: {
        t: (S) => (S.flags.kael_recruited ? 'Ready when you are. Point me at something that needs hitting.' : 'Timeborn. Still breathing? Good.'),
        choices: [
          { t: 'Tell me about yourself.', next: 'self', cond: (S) => !S.flags.kael_story },
          { t: 'Is something wrong? You keep looking east.', next: 'locket', cond: (S) => S.flags.kael_story && !S.flags.locket_started },
          { t: 'I found your sister’s locket.', next: 'give', cond: (S) => S.flags.locket_found && !S.flags.kael_recruited },
          { t: 'Do you know where Lyra’s journal ended up?', next: 'journal', cond: (S) => S.flags.told_lyra && !S.flags.journal_asked },
          { t: 'Travel with me.', next: 'follow', cond: (S) => S.flags.kael_recruited && !S.flags.kael_following },
          { t: 'Wait here for now.', next: 'stay', cond: (S) => S.flags.kael_following },
          { t: 'Never mind.', end: true },
        ],
      },
      self: { t: 'Not much to tell. Born in the Covenant fort at Kestrel’s Rest. Swore the oath at fifteen. Buried more friends than I can count. My sister Mira was a scout. She went into the Charwood two winters ago and never came back.', next: 'self2', fx: { flag: 'kael_story', aff: { kael: 3 } } },
      self2: {
        choices: [
          { t: 'I’m sorry, Kael.', tag: 'Kind', next: 'sorry', fx: { aff: { kael: 5 } } },
          { t: 'Then let’s make sure nobody else is lost.', tag: 'Resolute', next: 'resolve', fx: { aff: { kael: 3 } } },
        ],
      },
      sorry: { t: '…Yeah. Me too. Thanks.', end: true },
      resolve: { t: 'Now you sound like a knight. Keep that up.', end: true },
      locket: { t: 'Mira wore a silver locket. Our mother’s. If it’s anywhere, it’s with the cinder hounds that nest in the east Charwood. I’ve never had the numbers to go in. You… might.', end: true, fx: { flag: 'locket_started', quest: 'locket' } },
      give: { s: '', t: 'Kael turns the blackened locket over. When it opens, a tiny painted face looks up at him: a laughing girl with his eyes.', next: 'give2', fx: { flag: 'locket_given' } },
      give2: { t: 'You went into that nest for a stranger’s keepsake. I won’t forget it. Wherever you go in this Age, my sword goes with you.', end: true, fx: { aff: { kael: 20 }, recruit: 'kael', advance: 'locket' } },
      journal: {
        t: (S) => (S.flags.journal_buried ? 'A journal? Come to think of it, the old observatory ruin has a sealed vault under the floor. Nobody’s ever cracked it. Try digging there.' : 'The Covenant archive at Kestrel’s Rest has an old journal full of star charts. The Captain uses it to aim the fort’s signal mirrors. Saved a lot of lives, that book.'),
        end: true,
        fx: { flag: 'journal_asked' },
      },
      follow: { t: 'Lead on.', end: true, action: () => G.story.setFollow('kael', true) },
      stay: { t: 'I’ll hold here.', end: true, action: () => G.story.setFollow('kael', false) },
    },
  },
  lyra_hub: {
    nodes: {
      start: {
        redirect: (S) => (S.flags.told_lyra || !S.flags.shift_unlocked ? 'main' : 'main'),
      },
      main: {
        t: (S) => (S.flags.lyra_recruited ? 'Where to, Wayfarer? I packed three notebooks and a sandwich.' : S.flags.fracture ? 'The stars are still wrong. Every night a little more wrong.' : 'The Dawnwatch Pillar, Wayfarer! South-east!'),
        choices: [
          { t: 'Can I help with your research?', next: 'lens', cond: (S) => S.flags.told_lyra && !S.flags.lens_started },
          { t: 'I brought a star crystal from the future.', next: 'givelens', cond: (S) => S.flags.lens_started && !S.flags.lyra_recruited && S.inv.crystal >= 3 },
          { t: 'What do you think of me, honestly?', next: 'opinion', cond: (S) => S.flags.told_lyra },
          { t: 'Travel with me.', next: 'follow', cond: (S) => S.flags.lyra_recruited && !S.flags.lyra_following },
          { t: 'Wait here for now.', next: 'stay', cond: (S) => S.flags.lyra_following },
          { t: 'Goodbye, Lyra.', end: true },
        ],
      },
      lens: { t: 'Actually, yes! My telescope lens cracked the night the stars went out. In your future, Sela said crystals grow in the Age of Stars. Bring me three Star Crystals and I could see the Spire’s heart itself.', end: true, fx: { flag: 'lens_started', quest: 'lens' } },
      givelens: { s: '', t: 'Lyra grinds and polishes through the night. At dawn she peers through her new lens, then sits down very suddenly.', next: 'givelens2', fx: { take: { crystal: 3 } } },
      givelens2: { t: 'There’s someone inside the Heart. Someone who has been waiting. Wayfarer, I’m coming with you. Don’t argue. You’ll need someone who can read what we find.', end: true, fx: { aff: { lyra: 20 }, recruit: 'lyra', advance: 'lens', element: 1 } },
      opinion: { t: (S) => (S.affinity.lyra >= 30 ? 'Honestly? You’re the best thing that’s fallen into Mirror Lake since my grandmother’s spectacles. I’m glad I found you.' : S.affinity.lyra >= 0 ? 'You’re a mystery with a sword. I like mysteries. I’m still deciding about the sword.' : 'You scare me a little, Wayfarer. I hope you’re kinder than you seem.'), end: true },
      follow: { t: 'Finally! Adventure!', end: true, action: () => G.story.setFollow('lyra', true) },
      stay: { t: 'I’ll catalogue some stars while I wait.', end: true, action: () => G.story.setFollow('lyra', false) },
    },
  },
  oriel_intro: {
    nodes: {
      start: { s: 'Oriel', t: 'Oh. Oh! A Timeborn, at last. I have waited such a long time. Long enough to forget my own name, almost.', next: 'a' },
      a: { s: 'Oriel', t: 'I am Oriel. I think I was once a part of the Heart, its keeper-light. Now I am only a little light that keeps the pilgrims company.', next: 'b' },
      b: { s: 'Oriel', t: 'The Shard of Stars rose into the sky with its Warden, Nyxara. The Starwell below us breathes upward. Glide into it and it will carry you to the Astral Isles.', next: 'c' },
      c: {
        s: 'Oriel',
        t: 'May I come with you? I am small, but I am bright, and I bite. Well, I zap.',
        choices: [
          { t: 'I’d be glad of the company.', tag: 'Warm', next: 'yes', fx: { aff: { oriel: 10 } } },
          { t: 'Stay close and stay out of trouble.', next: 'yes' },
        ],
      },
      yes: { s: 'Oriel', t: 'Wonderful! If you find echoes of my memory, glowing atop the old Sun Pillars, would you bring them back to me?', end: true, fx: { flag: 'met_oriel', recruit: 'oriel', quest: 'memories' } },
    },
  },
  oriel_hub: {
    nodes: {
      start: {
        t: (S) => (S.flags.memories_done ? 'I remember now. I remember all of it. Thank you, friend.' : 'Hello again! Did you find any of my echoes?'),
        choices: [
          { t: 'Who were you, before?', next: 'who', cond: (S) => S.flags.memories_done },
          { t: 'Travel with me.', next: 'follow', cond: (S) => !S.flags.oriel_following },
          { t: 'Wait here.', next: 'stay', cond: (S) => S.flags.oriel_following },
          { t: 'Not yet.', end: true },
        ],
      },
      who: { t: 'I was the Chronarch’s light. Vaelith, they were called, before the title swallowed the name. They made me to keep them company in the long watch. When they tried to stop time, I was the first thing that froze.', end: true },
      follow: { t: 'Yay!', end: true, action: () => G.story.setFollow('oriel', true) },
      stay: { t: 'I will glow here patiently.', end: true, action: () => G.story.setFollow('oriel', false) },
    },
  },
  archivist: {
    nodes: {
      start: { t: 'A visitor from the long ago! The pilgrims sing of you, you know. The Wayfarer who walked between Ages.', next: 'a' },
      a: {
        choices: [
          { t: 'What happened to the world?', next: 'world' },
          { t: 'Who is the Chronarch?', next: 'chron' },
          { t: 'What do the pilgrims believe?', next: 'pilgrims' },
          { t: 'Farewell.', end: true },
        ],
      },
      world: { t: 'The Ash Age ended when the last husk crumbled. The world healed, strangely. Crystal grew where trees once stood. The sky filled with stars that never set. Beautiful. And a little lonely.', next: 'a' },
      chron: { t: 'Vaelith the Chronarch. They loved one moment so dearly they tried to hold it forever. When the Heart broke, they were trapped inside it, outside of time. Some say they are still there, still holding on.', next: 'a' },
      pilgrims: { t: 'That every Age is precious because it ends. Bloom, Ash, Stars. A song is only a song because the notes move on.', next: 'a', fx: { flag: 'archivist_lore' } },
    },
  },
  orin: {
    nodes: {
      start: { redirect: (S) => (S.quests?.st?.wolves?.done || flag(S, 'wolves_done') ? 'done' : flag(S, 'wolves_started') ? 'wait' : 'intro') },
      intro: { t: 'Orin, huntsman of Kestrel’s Rest. You look like you can swing that thing. Bramble wolves have been taking our goats. Thin the pack and I’ll make it worth your while.', end: true, fx: { flag: 'wolves_started', quest: 'wolves' } },
      wait: { t: 'Wolves still out there. They den in the meadows south of here.', end: true },
      done: { t: 'Goats are safe, kids are happy, and I owe you. Come by any time.', end: true },
    },
  },
  bram: {
    nodes: {
      start: {
        t: (S) => (S.sword === 'wayfarer' ? 'That blade of yours is fine work, but old. Bring me six iron ore and I’ll fold it into something with real bite. Free of charge, for the one who cleared the fields.' : 'How’s that edge holding up? Still sharp? Good.'),
        choices: [
          { t: 'Here’s the iron. (6 Iron Ore)', next: 'forge', cond: (S) => S.inv.iron >= 6 && S.sword === 'wayfarer' },
          { t: 'Where do I find iron?', next: 'where', cond: (S) => S.sword === 'wayfarer' },
          { t: 'Goodbye.', end: true },
        ],
      },
      where: { t: 'Gilded Constructs are full of it. Clanking things, out by the mesas. Big dark boulders, too. Hit them with your sword and see what falls out.', end: true },
      forge: { s: '', t: 'Sparks fly for an hour. Bram plunges the blade into the quench, and it comes out singing.', next: 'forge2', fx: { take: { iron: 6 } } },
      forge2: { t: 'The Ironheart. Treat it well.', end: true, action: (S) => { S.owned.sword_iron = true; G.game.equipSword('iron'); G.hud.banner('Ironheart Sword', 'Equipped. +6 damage', 'item'); } },
    },
  },
  tilda: {
    nodes: {
      start: {
        t: 'Fresh tonics! Sunbloom brewed this very morning. For you, a fair trade.',
        choices: [
          { t: 'Trade 3 Plant Fiber for a Sunbloom Tonic.', next: 'buy', cond: (S) => S.inv.fiber >= 3 },
          { t: 'Trade 2 Beast Hide for an Aether Draught.', next: 'buy2', cond: (S) => S.inv.hide >= 2 },
          { t: 'Any gossip?', next: 'gossip' },
          { t: 'Just looking.', end: true },
        ],
      },
      buy: { t: 'Pleasure doing business!', end: true, fx: { take: { fiber: 3 }, give: { tonic: 1 } } },
      buy2: { t: 'Lovely, lovely hide.', end: true, fx: { take: { hide: 2 }, give: { draught: 1 } } },
      gossip: { t: 'They say if you climb the Spire island at midnight you can hear it ticking. Also, Hob’s turnip won a ribbon. Mostly the turnip thing.', end: true },
    },
  },
  sela_hub: {
    nodes: {
      start: {
        t: (S) => (shards(S) >= 3 ? 'All three Shards. Go to the Spire, Wayfarer. Whatever waits there, we are with you.' : 'The Circle endures. How goes your journey?'),
        choices: [
          { t: 'Where is Cinderpeak?', next: 'cinder', cond: (S) => !S.inv.shardEmber },
          { t: 'Voss wants your grain.', next: 'grain', cond: (S) => S.flags.grain_started && !S.flags.grain_done },
          { t: 'Farewell.', end: true },
        ],
      },
      cinder: { t: 'North, past the dry river, where the mountain breathes fire. Morgrath the Ember Tyrant nests in the crater. Bring frost. Lots of frost.', end: true },
      grain: { t: 'Voss is not a cruel man, only a frightened one. But that grain is seed for next spring. If we eat it, there is no next spring. Choose wisely when you speak to him.', end: true },
    },
  },
  refugee: { nodes: { start: { t: (S) => (S.flags.grain_verdant ? 'You stood up for us. Thank you.' : S.flags.grain_covenant ? 'The soldiers ate well tonight. My children did not.' : 'Warm fire, cold soup. It’s more than most have.'), end: true } } },
  pilgrim: { nodes: { start: { t: 'The stars are singing tonight. Can you hear them, Timeborn?', end: true } } },
  child: { nodes: { start: { t: 'Are you a knight? Can I hold your sword? Mum says no but she’s not here.', end: true } } },
  hob: { nodes: { start: { t: (S) => (S.flags.thorns_cleared ? 'Bless you for clearing those thornlings. My turnips thank you. So do I.' : 'Those bramble beasts are trampling my turnips! Somebody ought to do something.'), end: true } } },
  guard: { nodes: { start: { t: 'Hearthmere’s quiet, mostly. Keep your blade sheathed in the square and we’ll get along.', end: true } } },
  rosalind: { nodes: { start: { t: 'Welcome to the Gilded Goose. Best stew in Meadowvale. Only stew in Meadowvale. Rest by the hearth any time, love.', end: true } } },
  soldier: { nodes: { start: { t: 'Hold the line. That’s all we do. Hold the line.', end: true } } },
  // ------------------------------------------------------------ the end
  chronarch: {
    nodes: {
      start: { s: 'The Chronarch', t: 'Enough. Enough. You have broken me in three Ages. Look at what you hold, Timeborn. The Heart, whole again.', next: 'a' },
      a: { s: 'The Chronarch', t: 'I only wanted the bloom to last. Was that so wrong? I watched every spring die. I could not bear one more.', next: 'b' },
      b: {
        s: '',
        t: 'The three Shards rise from your pack and spin into one blazing Heart above your palm. Time waits for your answer.',
        choices: [
          { t: 'Mend the Heart and let time flow again.', tag: 'Restore', next: 'restore' },
          { t: 'Take the Heart. I will rule the Ages and keep them safe.', tag: 'Claim', next: 'claim' },
          { t: 'Let the Ages part. Each will live and end on its own.', tag: 'Release', next: 'release' },
          { t: 'Call to Lyra, Kael and Oriel across time.', tag: 'Together', next: 'together', cond: (S) => S.affinity.lyra >= 30 && S.affinity.kael >= 30 && S.affinity.oriel >= 20 },
        ],
      },
      restore: { s: 'The Chronarch', t: 'Then let it flow. And let me flow with it, at last.', end: true, action: () => G.story.ending('restore') },
      claim: { s: 'The Chronarch', t: 'So the watch passes to you. I pity you, Timeborn. You will learn what I learned.', end: true, action: () => G.story.ending('claim') },
      release: { s: 'The Chronarch', t: 'Three songs instead of one. How… brave.', end: true, action: () => G.story.ending('release') },
      together: { s: 'The Chronarch', t: 'They answer? Across a thousand years, they answer you? Then perhaps time was never meant to be held by one alone.', end: true, action: () => G.story.ending('together') },
    },
  },
};

// ---------------------------------------------------------------------------
export const QUESTS = {
  main1: {
    title: 'The Timeborn',
    kind: 'main',
    steps: [
      { id: 'village', text: 'Follow Lyra to Hearthmere', reach: 12, epoch: 0, target: () => ({ x: G.content.hearthmere.cx, z: G.content.hearthmere.cz }) },
      { id: 'maren', text: 'Speak with Elder Maren in the square', flag: 'talked_maren', epoch: 0, target: () => G.story.npcPos('maren') },
      { id: 'thorns', text: 'Clear the Thornling nest south of the fields', camp: 'quest_thorn', epoch: 0, target: () => ({ x: -245, z: 420 }) },
      { id: 'thanks', text: 'Return to Elder Maren', flag: 'maren_thanks', epoch: 0, target: () => G.story.npcPos('maren') },
      { id: 'lyra', text: 'Visit Lyra at the observatory', flag: 'lyra_pillar', epoch: 0, target: () => G.story.npcPos('lyra') },
      { id: 'climb', text: 'Climb the Dawnwatch Pillar', reach: 6, reachY: 4, epoch: 0, target: () => { const p = G.content.pillars[0]; return { x: p.x, z: p.z, y: p.top }; } },
      { id: 'attune', text: 'Attune your astrolabe at the summit', flag: 'fracture', target: () => { const p = G.content.pillars[0]; return { x: p.x, z: p.z, y: p.top }; } },
    ],
    reward: { xp: 120 },
    onComplete: () => G.quests.start('main2'),
  },
  main2: {
    title: 'Fracture',
    kind: 'main',
    steps: [
      { id: 'ruins', text: 'Search the ruins of Hearthmere for survivors', reach: 20, epoch: 1, target: () => ({ x: G.content.hearthmere.cx, z: G.content.hearthmere.cz }) },
      { id: 'kael', text: 'Speak with the wary knight', flag: 'met_kael', epoch: 1, target: () => G.story.npcPos('kael') },
      { id: 'sela', text: 'Speak with Sela by the fire', flag: 'shift_unlocked', epoch: 1, target: () => G.story.npcPos('sela') },
      { id: 'back', text: 'Shift back to the Age of Bloom (press T)', reachEpoch: 0 },
      { id: 'tell', text: 'Tell Lyra what you saw', flag: 'told_lyra', epoch: 0, target: () => G.story.npcPos('lyra') },
    ],
    reward: { xp: 150 },
    onComplete: () => G.quests.start('main3'),
  },
  main3: {
    title: 'The Three Shards',
    kind: 'main',
    steps: [
      { id: 'maren', text: 'Seek Elder Maren’s counsel', flag: 'maren_shards', epoch: 0, target: () => G.story.npcPos('maren') },
      {
        id: 'shards',
        text: (S) => {
          const n = shards(S);
          const left = [];
          if (!S.inv.shardDawn) left.push('Varok at the Gilded Ring (Bloom)');
          if (!S.inv.shardEmber) left.push('Morgrath atop Cinderpeak (Ash)');
          if (!S.inv.shardStar) left.push('Nyxara above the Thornwood (Stars)');
          return `Reclaim the Shards ${n}/3 — ${left[0] || ''}`;
        },
        check: (S) => shards(S) >= 3,
        target: (S) => {
          if (!S.inv.shardDawn) return { x: G.content.colosseum.x, z: G.content.colosseum.z };
          if (!S.inv.shardEmber) return { x: G.content.crater.x, z: G.content.crater.z };
          if (!S.inv.shardStar) return { x: G.content.astral.base.x, z: G.content.astral.base.z };
          return null;
        },
      },
    ],
    reward: { xp: 300 },
    onComplete: () => G.quests.start('main4'),
  },
  main4: {
    title: 'Heart of Time',
    kind: 'main',
    steps: [
      { id: 'spire', text: 'Bring the three Shards to the Chrono Spire', reach: 22, target: () => ({ x: G.content.spire.x, z: G.content.spire.z }) },
      { id: 'boss', text: 'Defeat the Chronarch', flag: 'chronarch_defeated', target: () => ({ x: G.content.spire.x, z: G.content.spire.z }) },
      { id: 'choose', text: 'Decide the fate of time', flag: 'ending_chosen' },
    ],
  },
  seed: {
    title: 'The Sunheart Seed',
    steps: [
      { id: 'plant', text: 'Plant the Sunheart seed on the hill north of Hearthmere', flag: 'seed_planted', epoch: 0, target: () => G.story.seedSpot },
      { id: 'see', text: 'See what a thousand years have grown', reach: 14, epoch: 1, target: () => G.story.seedSpot },
    ],
    reward: { xp: 120 },
  },
  grain: {
    title: 'Grain or Steel',
    steps: [{ id: 'decide', text: 'Settle the dispute between Captain Voss and Sela', target: () => G.story.npcPos('voss') }],
  },
  locket: {
    title: 'A Silver Locket',
    steps: [
      { id: 'nest', text: 'Clear the cinder hound nest in the east Charwood', camp: 'quest_hounds', epoch: 1, target: () => ({ x: 330, z: -40 }) },
      { id: 'return', text: 'Return Mira’s locket to Kael', flag: 'locket_given', epoch: 1, target: () => G.story.npcPos('kael') },
    ],
    reward: { xp: 150 },
  },
  lens: {
    title: 'A Lens for Lyra',
    steps: [
      { id: 'crystals', text: 'Gather 3 Star Crystals in the Age of Stars', item: 'crystal', count: 3, epoch: 2 },
      { id: 'return', text: 'Bring the crystals to Lyra in the Age of Bloom', flag: 'lyra_recruited', epoch: 0, target: () => G.story.npcPos('lyra') },
    ],
    reward: { xp: 150 },
  },
  memories: {
    title: 'Echoes of Oriel',
    steps: [
      { id: 'echoes', text: (S) => `Find Oriel’s memory echoes atop the Sun Pillars (${S.flags.echoes || 0}/3)`, check: (S) => (S.flags.echoes || 0) >= 3, epoch: 2, target: () => G.story.nextEcho() },
    ],
    reward: { xp: 150 },
    onComplete: (S) => { S.flags.memories_done = true; S.affinity.oriel = Math.min(100, S.affinity.oriel + 25); G.hud.toast('Oriel greatly approves.', 'approve'); },
  },
  wolves: {
    title: 'Wolves at the Gate',
    steps: [{ id: 'kill', text: 'Hunt bramble wolves', count: 5, kill: (e) => e.type === 'wolf', epoch: 0, target: () => ({ x: 100, z: 480 }) }],
    reward: { xp: 100, items: { hide: 3, tonic: 2 } },
    onComplete: (S) => (S.flags.wolves_done = true),
  },
  pillars: {
    title: 'Sun Pillars',
    steps: [{ id: 'all', text: (S) => `Attune all three Sun Pillars (${S.flags.pillars || 0}/3)`, check: (S) => (S.flags.pillars || 0) >= 3, target: () => G.story.nextPillar() }],
    reward: { xp: 200, items: { starShard: 3 } },
  },
};
