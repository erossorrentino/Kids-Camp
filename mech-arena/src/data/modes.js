/**
 * GAME MODES
 * ------------------------------------------------------------------
 * Modes are declarative. match.js reads these fields and only the
 * `objective` string changes how scoring works, so a new mode is a row
 * here plus (optionally) a case in match.updateObjective().
 */

export const MODES = {
  tdm: {
    id:'tdm', name:'TEAM DEATHMATCH', short:'TDM',
    teams:2, perTeam:5, duration:300, scoreLimit:30,
    objective:'kills', respawn:true, hangarSize:5,
    desc:'Five on five. Every destroyed mech is a point. First team to thirty, or highest score at the horn.',
  },
  duel: {
    id:'duel', name:'DUEL', short:'2v2',
    teams:2, perTeam:2, duration:240, scoreLimit:12,
    objective:'kills', respawn:true, hangarSize:3,
    desc:'Two on two on a tight map. No hiding, no filler -- your loadout choices are the whole match.',
  },
  ffa: {
    id:'ffa', name:'FREE FOR ALL', short:'FFA',
    teams:8, perTeam:1, duration:300, scoreLimit:20,
    objective:'kills', respawn:true, hangarSize:5,
    desc:'Eight pilots, no friends. Twenty kills or the top score when the clock runs out.',
  },
  control: {
    id:'control', name:'CONTROL POINT CLASH', short:'CONTROL',
    teams:2, perTeam:5, duration:360, scoreLimit:1000,
    objective:'points', respawn:true, hangarSize:5, zones:3,
    desc:'Three zones. Holding them ticks up your score. Contesting one stops the enemy cold.',
  },
  king: {
    id:'king', name:'HARDPOINT', short:'KING',
    teams:2, perTeam:5, duration:300, scoreLimit:600,
    objective:'king', respawn:true, hangarSize:5, zones:1, rotateEvery:60,
    desc:'One live zone that relocates every sixty seconds. Hold it, then be ready to move.',
  },
  attrition: {
    id:'attrition', name:'LAST LANCE', short:'ATTRITION',
    teams:2, perTeam:5, duration:420, scoreLimit:0,
    objective:'elimination', respawn:false, hangarSize:5, livesPerPlayer:5,
    desc:'No respawn timer -- your hangar is your lives. Lose all five mechs and you are out for good.',
  },
  juggernaut: {
    id:'juggernaut', name:'JUGGERNAUT', short:'JUGG',
    teams:2, perTeam:5, duration:300, scoreLimit:25,
    objective:'juggernaut', respawn:true, hangarSize:5,
    desc:'One pilot per team is the Juggernaut: double armour, double kill value. Protect yours, hunt theirs.',
  },
};

export const MODE_LIST = Object.values(MODES);
export function getMode(id) { return MODES[id] || MODES.tdm; }
