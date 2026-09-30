// Things that make your shots look cool and change nothing else: tracer
// trails and ball colours, bought in the pro shop's Style tab.

export const TRAILS = [
  { id: 'classic', name: 'TV tracer', desc: 'The classic golden broadcast line.', price: 0, colors: ['#ffc93c'] },
  { id: 'neon', name: 'Neon pink', desc: 'A hot pink glow across the sky.', price: 8000, colors: ['#ff4fd8'] },
  { id: 'ice', name: 'Ice comet', desc: 'Frosty white to icy blue, with snowflake sparkles.', price: 20000, colors: ['#e8fbff', '#5fd3ff'], particles: 'ice' },
  { id: 'fire', name: 'Fireball', desc: 'Yellow, orange and red flames, spitting embers.', price: 25000, colors: ['#fff27a', '#ff8c1a', '#ff2a1a'], particles: 'fire' },
  { id: 'sparkle', name: 'Stardust', desc: 'A trail of twinkling golden stars.', price: 22000, colors: ['#fff6c2', '#f2c230'], particles: 'sparkle' },
  { id: 'rainbow', name: 'Rainbow', desc: 'Every colour of the rainbow, all the way to the green.', price: 30000, rainbow: true },
  { id: 'confetti', name: 'Party time', desc: 'Confetti streams out behind the ball.', price: 35000, colors: ['#ffffff'], particles: 'confetti' },
  { id: 'lightning', name: 'Lightning bolt', desc: 'Crackling electric blue with a zig-zag bolt.', price: 45000, colors: ['#bfe9ff', '#3a86ff'], particles: 'spark', zigzag: true },
];
export const TRAIL_BY_ID = Object.fromEntries(TRAILS.map((t) => [t.id, t]));

export const BALL_COLORS = [
  { id: 'white', name: 'Tour white', color: '#ffffff', price: 0 },
  { id: 'yellow', name: 'Optic yellow', color: '#f4ff4f', price: 3000 },
  { id: 'orange', name: 'Blaze orange', color: '#ff8a2a', price: 3000 },
  { id: 'pink', name: 'Bubblegum pink', color: '#ff7ac8', price: 3000 },
  { id: 'lime', name: 'Lime', color: '#8dff5a', price: 3000 },
  { id: 'blue', name: 'Sky blue', color: '#6ec6ff', price: 5000 },
  { id: 'gold', name: 'Gold', color: '#e8c04a', price: 20000 },
];
export const BALL_COLOR_BY_ID = Object.fromEntries(BALL_COLORS.map((b) => [b.id, b]));
