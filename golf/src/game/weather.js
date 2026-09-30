// Weather and time of day for a round. Rain softens the ground (less roll)
// and slows the greens; fog shortens how far you can see; night rounds are
// played under floodlights.
import { clamp } from '../util/rng.js';

export const WEATHERS = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rain: 'Rain',
  fog: 'Fog',
};

export const TIMES = [
  ['0.3', 'Morning'],
  ['0.5', 'Midday'],
  ['0.78', 'Late afternoon'],
  ['0.93', 'Sunset'],
  ['night', 'Night (floodlights)'],
];

// Typical weather for a course style (used when the player picks "course")
export function rollWeather(style, rng) {
  const rain = { Links: 0.2, Parkland: 0.1, Forest: 0.12, Coastal: 0.12, Tropical: 0.16, Heathland: 0.12, Mountain: 0.1, Desert: 0.02 }[style] ?? 0.1;
  const fog = { Links: 0.08, Coastal: 0.08, Forest: 0.05, Mountain: 0.06 }[style] ?? 0.02;
  const cloud = style === 'Links' ? 0.4 : 0.14;
  const r = rng.next();
  if (r < rain) return 'rain';
  if (r < rain + fog) return 'fog';
  if (r < rain + fog + cloud) return 'cloudy';
  return 'sunny';
}

// Fill in weather and time on a conditions object and apply their effect
export function applyWeather(cond, weather, time, rng) {
  cond.weather = weather;
  cond.overcast = weather !== 'sunny';
  if (time === 'night') {
    cond.night = true;
    cond.timeOfDay = 0.5;
  } else if (time != null) {
    cond.night = false;
    cond.timeOfDay = parseFloat(time);
  }
  if (weather === 'rain') {
    cond.rainLevel = rng ? rng.float(0.55, 1) : 0.8;
    cond.stimp = clamp(cond.stimp - 1.5, 8, 15);
    cond.firm = clamp(cond.firm * 0.55, 0.12, 0.9);
  }
  return cond;
}

export function weatherText(cond) {
  const w = cond.weather || (cond.overcast ? 'cloudy' : 'sunny');
  if (w === 'rain') return (cond.rainLevel || 0.8) > 0.8 ? 'Heavy rain' : 'Rain showers';
  return WEATHERS[w] || 'Sunny';
}

export function timeText(cond) {
  if (cond.night) return 'Night, under lights';
  const t = cond.timeOfDay ?? 0.5;
  return t < 0.4 ? 'Morning' : t < 0.62 ? 'Midday' : t < 0.88 ? 'Afternoon' : 'Sunset';
}
