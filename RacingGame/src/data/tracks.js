// Circuit definitions. All venues are fictional.
// layout: ['S', length] straight | ['L'|'R', degrees, radius] corner.
// The loop is auto-closed; the start/finish line is at the start of the first
// command, and the grid sits on the end of the last command.

export const TRACKS = [
  {
    id: 'kingsbridge', scale: 1.25, name: 'Kingsbridge Grand Prix Circuit', short: 'Kingsbridge', location: 'Green Valley',
    env: 'noon', scenery: 'countryside', type: 'circuit', width: 14, laps: 3,
    blurb: 'A classic high-speed Grand Prix track through rolling green hills. Long straights, a tight hairpin and a fast final sweeper.',
    runoff: { inside: 'grass', outside: 'gravel', straight: 'grass' },
    layout: [
      ['S', 520], ['R', 95, 40], ['S', 90], ['L', 50, 120], ['R', 60, 160], ['S', 360],
      ['R', 165, 28], ['S', 260], ['L', 90, 70], ['R', 80, 85], ['S', 300], ['L', 60, 140],
      ['R', 60, 110], ['S', 430], ['L', 28, 34], ['R', 28, 34], ['S', 120], ['R', 90, 60],
      ['L', 40, 100], ['L', 30, 160], ['R', 80, 75], ['S', 300],
    ],
    elevation: [[0, 0], [0.12, 4], [0.25, 14], [0.38, 10], [0.5, -2], [0.62, -6], [0.75, 6], [0.88, 3]],
  },
  {
    id: 'azure', scale: 1.15, name: 'Azure Coast Street Circuit', short: 'Azure Coast', location: 'Riviera Harbour',
    env: 'sunset', scenery: 'coastal', type: 'street', width: 12, laps: 3,
    blurb: 'Tight harbour-front streets lined with walls and hotels, glowing in the sunset. Precision beats power here.',
    runoff: { inside: 'tarmac', outside: 'tarmac', straight: 'tarmac' },
    layout: [
      ['S', 420], ['L', 90, 24], ['S', 160], ['R', 40, 60], ['L', 70, 45], ['S', 200],
      ['L', 165, 16], ['S', 150], ['R', 90, 22], ['S', 170], ['R', 60, 40], ['L', 90, 26], ['S', 380],
      ['L', 28, 40], ['R', 28, 40], ['S', 150], ['L', 90, 24], ['S', 130], ['L', 55, 34], ['S', 210],
    ],
    elevation: [[0, 0], [0.2, 2], [0.35, 9], [0.5, 12], [0.62, 4], [0.8, 0]],
  },
  {
    id: 'neonbay', scale: 1.1, name: 'Neon Bay Night Grand Prix', short: 'Neon Bay', location: 'Neon Bay City',
    env: 'night', scenery: 'city', type: 'street', width: 14, laps: 3,
    blurb: 'A blazing night race under floodlights through a city of skyscrapers. Huge straights and heavy braking zones.',
    runoff: { inside: 'tarmac', outside: 'tarmac', straight: 'tarmac' },
    streetRunoff: 3,
    layout: [
      ['S', 700], ['R', 90, 30], ['S', 260], ['L', 90, 30], ['S', 220], ['R', 90, 35], ['S', 520],
      ['R', 45, 80], ['L', 45, 80], ['S', 300], ['R', 90, 28], ['S', 380], ['R', 30, 120], ['S', 420],
      ['R', 120, 35], ['S', 200], ['L', 60, 50], ['R', 75, 45], ['S', 420],
    ],
    elevation: [[0, 0]],
  },
  {
    id: 'redcanyon', scale: 1.2, name: 'Red Canyon Raceway', short: 'Red Canyon', location: 'Painted Desert',
    env: 'desert', scenery: 'desert', type: 'circuit', width: 14, laps: 3,
    blurb: 'Blistering heat, towering red mesas and sweeping fast corners that climb and dive through the canyon floor.',
    runoff: { inside: 'sand', outside: 'sand', straight: 'sand' },
    layout: [
      ['S', 600], ['L', 110, 70], ['S', 200], ['R', 70, 140], ['L', 60, 180], ['S', 280],
      ['L', 150, 35], ['S', 350], ['R', 60, 90], ['L', 100, 120], ['S', 260], ['L', 70, 55],
      ['R', 40, 200], ['S', 300], ['L', 90, 80], ['R', 30, 100], ['L', 40, 90], ['S', 350],
    ],
    elevation: [[0, 0], [0.1, 8], [0.22, 22], [0.35, 26], [0.48, 10], [0.6, -8], [0.72, -4], [0.86, 6]],
  },
  {
    id: 'alpine', scale: 1.3, name: 'Alpine Ring', short: 'Alpine Ring', location: 'High Pines',
    env: 'morning', scenery: 'alpine', type: 'circuit', width: 12, laps: 2,
    blurb: 'A legendary mountain ring through pine forests with big climbs, blind crests and plunging downhill corners.',
    runoff: { inside: 'grass', outside: 'grass', straight: 'grass' },
    runoffIn: 5, runoffOut: 7,
    layout: [
      ['S', 450], ['R', 80, 50], ['L', 40, 150], ['S', 300], ['R', 100, 70], ['L', 70, 90], ['S', 240],
      ['L', 120, 40], ['R', 60, 120], ['S', 400], ['R', 90, 60], ['L', 50, 100], ['R', 70, 80], ['S', 330],
      ['L', 40, 140], ['R', 140, 45], ['S', 300], ['L', 60, 70], ['R', 90, 90], ['S', 250], ['R', 70, 60], ['S', 260],
    ],
    elevation: [[0, 0], [0.08, 12], [0.18, 34], [0.28, 46], [0.38, 30], [0.48, 8], [0.58, -10], [0.68, -4], [0.78, 18], [0.9, 6]],
  },
  {
    id: 'thunder', scale: 1.0, name: 'Thunder Oval Speedway', short: 'Thunder Oval', location: 'Prairie Flats',
    env: 'golden', scenery: 'oval', type: 'oval', width: 18, laps: 6, maxBank: 24,
    blurb: 'Flat-out on the steep banking. Slipstream, stay brave and keep your foot down for every single lap.',
    runoff: { inside: 'grass', outside: 'tarmac', straight: 'grass' },
    layout: [['S', 320], ['L', 24, 320], ['S', 320], ['L', 156, 200], ['S', 680], ['L', 180, 200], ['S', 10]],
    elevation: [[0, 0]],
    smooth: 30,
  },
  {
    id: 'sakura', scale: 1.15, name: 'Sakura Hills Circuit', short: 'Sakura Hills', location: 'Blossom Valley',
    env: 'golden', scenery: 'sakura', type: 'circuit', width: 13, laps: 3,
    blurb: 'A technical, flowing circuit wrapped in cherry blossom. Linked esses reward a smooth, confident driver.',
    runoff: { inside: 'grass', outside: 'gravel', straight: 'grass' },
    layout: [
      ['S', 480], ['R', 70, 50], ['S', 80], ['L', 60, 60], ['R', 60, 60], ['L', 60, 70], ['S', 200],
      ['R', 140, 32], ['S', 300], ['R', 50, 110], ['L', 90, 60], ['S', 260], ['R', 100, 55],
      ['S', 380], ['R', 80, 45], ['L', 30, 90], ['S', 200], ['R', 90, 70], ['S', 260],
    ],
    elevation: [[0, 0], [0.15, 6], [0.3, 15], [0.45, 9], [0.6, -4], [0.75, 2], [0.9, 4]],
  },
  {
    id: 'glacier', scale: 1.15, name: 'Glacier Point Raceway', short: 'Glacier Point', location: 'Frost Peaks',
    env: 'snow', scenery: 'snow', type: 'circuit', width: 13, laps: 3,
    blurb: 'Crisp mountain air, snow-capped peaks and frozen pines. Fast, flowing and spectacular.',
    runoff: { inside: 'snow', outside: 'snow', straight: 'snow' },
    layout: [
      ['S', 550], ['L', 90, 55], ['S', 220], ['L', 60, 100], ['R', 80, 70], ['S', 300], ['L', 130, 40],
      ['S', 320], ['R', 50, 120], ['L', 70, 90], ['S', 280], ['L', 100, 60], ['R', 40, 150], ['S', 300],
      ['L', 60, 90], ['S', 200], ['L', 70, 70], ['S', 260],
    ],
    elevation: [[0, 0], [0.12, -6], [0.25, 6], [0.4, 18], [0.55, 12], [0.7, -4], [0.85, 2]],
  },
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
