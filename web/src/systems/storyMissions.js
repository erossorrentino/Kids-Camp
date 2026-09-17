// Hand-authored campaign missions — Mars Vega's story, from the Port
// Salvento blueprint. Always pinned at the top of the mission board (see
// MissionManager.listAvailable), ahead of the 500 procedurally generated
// jobs, with fixed payouts instead of a randomized range. Each still
// dispatches on the same `kind`s the generated pool uses, so no new
// mechanics were needed to make them playable.
export const STORY_MISSIONS = [
  {
    type: 'STORY_1',
    title: 'CORNER STORE ECONOMICS',
    detail: "A fixer's package has to reach a buyer in Chinatown before a rival crew intercepts it — arrive BY VEHICLE, showing up on foot voids the drop.",
    cfg: {
      kind: 'delivery', requireVehicle: true, timeLimit: 60,
      minDist: 90, maxDist: 160, rewardRange: [5000, 5000],
    },
  },
  {
    type: 'STORY_2',
    title: 'THE LIEUTENANT',
    detail: 'A Vega Cartel lieutenant overseeing an Industrial Park shipment knows a name you need. Take him down before his detail sounds the alarm.',
    cfg: {
      kind: 'hitman', timeLimit: 90, targetCount: 1,
      rewardRange: [25000, 25000],
    },
  },
  {
    type: 'STORY_3',
    title: 'IRONCLAD',
    detail: "Ironclad Credit Union is the Vega Cartel's real vault. Crack it, then get away BY VEHICLE before Bracewell's net closes — this is the last score.",
    cfg: {
      kind: 'heist', requireVehicleEscape: true, timeLimit: 200,
      minDist: 120, maxDist: 220, escapeMinDist: 100, escapeMaxDist: 200,
      alarmStars: 5, rewardRange: [3000000, 3000000],
    },
  },
];
