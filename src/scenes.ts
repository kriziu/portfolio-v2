export const COLS = 110;
export const ROWS = 34;

type Shade = (x: number, y: number, time: number, life: number) => number;
type Plot = (x: number, y: number, weight: number, hue: number) => void;
type Emit = (time: number, plot: Plot, life: number) => void;
type Form = (u: number, index: number, time: number) => [x: number, y: number, z: number, hue: number, power?: number];
type Wipe = (x: number, y: number, grain: number) => number;

export type Frame = {
  from: number;
  to: number;
  progress: number;
  time: number;
  wipe: number;
  life?: number;
  origin?: [x: number, y: number];
};

export type Draw = (frame: Frame) => void;

export const HOLD_S = 2.1;
export const FADE_S = 1;
export const RAMP = ' .:-=+*#%@';
const CELL = 0.06;
const STEP = 0.1;
const TAU = Math.PI * 2;
const FLIGHT = 0.22;
const HOT_FROM = 2.4;
const HOT_GAIN = 0.09;

const { abs, asin, atan2, cos, exp, floor, hypot, log, max, min, sin, sqrt } = Math;

const clamp = (value: number, low = 0, high = 1): number => min(high, max(low, value));
const fract = (value: number): number => value - floor(value);
const ease = (value: number): number => value * value * (3 - 2 * value);
const noise = (a: number, b: number): number => fract(sin(a * 12.9898 + b * 78.233) * 43758.5453);
const glow = (distance: number, width: number): number => exp(-((distance / width) ** 2));

export let tint = 0;

const swarm = (emit: Emit): Shade => {
  const amounts = new Float32Array(COLS * ROWS);
  const peaks = new Float32Array(COLS * ROWS);
  const hues = new Float32Array(COLS * ROWS);
  let stamp = NaN;
  const add = (cell: number, weight: number, hue: number): void => {
    amounts[cell] += weight;
    if (weight > peaks[cell]) {
      peaks[cell] = weight;
      hues[cell] = hue;
    }
  };
  const plot: Plot = (x, y, weight, hue) => {
    const across = x / CELL + COLS / 2 - 0.5;
    const down = ROWS / 2 - 0.5 - y / STEP;
    const col = floor(across);
    const row = floor(down);
    if (col < 0 || row < 0 || col >= COLS - 1 || row >= ROWS - 1) return;
    const u = across - col;
    const v = down - row;
    const cell = row * COLS + col;
    add(cell, (1 - u) * (1 - v) * weight, hue);
    add(cell + 1, u * (1 - v) * weight, hue);
    add(cell + COLS, (1 - u) * v * weight, hue);
    add(cell + COLS + 1, u * v * weight, hue);
  };
  return (x, y, time, life) => {
    if (stamp !== time) {
      stamp = time;
      amounts.fill(0);
      peaks.fill(0);
      emit(time, plot, life);
    }
    const col = clamp(floor(x / CELL + COLS / 2), 0, COLS - 1);
    const row = clamp(floor(ROWS / 2 - y / STEP), 0, ROWS - 1);
    const cell = row * COLS + col;
    const amount = amounts[cell];
    tint = hues[cell];
    return 1 - exp(-amount) + max(amount - HOT_FROM, 0) * HOT_GAIN;
  };
};

const ORBIT_SAMPLES = 1800;
const ORBIT_STEPS = 12;

const solveOrbit = (speedX: number, speedY: number, period: number): Float32Array => {
  const samples = new Float32Array(ORBIT_SAMPLES * 6);
  const place = [-1, 0, 1, 0, 0, 0];
  const speed = [speedX, speedY, speedX, speedY, -2 * speedX, -2 * speedY];
  const pull = [0, 0, 0, 0, 0, 0];
  const gravity = (): void => {
    pull.fill(0);
    for (const [a, b] of [[0, 2], [0, 4], [2, 4]]) {
      const x = place[b] - place[a];
      const y = place[b + 1] - place[a + 1];
      const strength = hypot(x, y) ** -3;
      pull[a] += x * strength;
      pull[a + 1] += y * strength;
      pull[b] -= x * strength;
      pull[b + 1] -= y * strength;
    }
  };
  const tick = period / ORBIT_SAMPLES / ORBIT_STEPS;
  gravity();
  for (let sample = 0; sample < ORBIT_SAMPLES; sample++) {
    samples.set(place, sample * 6);
    for (let step = 0; step < ORBIT_STEPS; step++) {
      for (let i = 0; i < 6; i++) {
        speed[i] += (pull[i] * tick) / 2;
        place[i] += speed[i] * tick;
      }
      gravity();
      for (let i = 0; i < 6; i++) speed[i] += (pull[i] * tick) / 2;
    }
  }
  return samples;
};

const SUN_HUES = [38, 266, 192];

const trio =
  (orbit: Float32Array, seconds: number, wide: number, tall: number, reach: number): Form =>
  (u, index, time) => {
    const which = index % 3;
    const sun = u < 0.34;
    const tail = sun ? 0 : ((u - 0.34) / 0.66) ** 1.7 * reach;
    const sample = floor(fract(time / seconds - tail) * ORBIT_SAMPLES) * 6 + which * 2;
    const ember = noise(index, 1);
    const throb = 1 + sin(time * 7 + which * 2.1) * 0.2;
    const spike = u < 0.13;
    const angle = spike ? floor(noise(index, 7) * 4) * (TAU / 4) + time * 0.8 + which : noise(index, 2) * TAU;
    const spread = spike ? ember ** 1.7 * 0.8 * throb : sun ? ember ** 1.5 * 0.2 * throb : 0.012 + tail * ember ** 4 * 0.7;
    const power = spike ? 2.8 * (1 - ember) : sun ? 3 * (1 - ember) + 0.9 : 0.3 + (1 - tail / reach) ** 2 * 2;
    return [orbit[sample] * wide + cos(angle) * spread, orbit[sample + 1] * tall + sin(angle) * spread, tail * 3.4, SUN_HUES[which], power];
  };

const moth = trio(solveOrbit(0.464445, 0.39606, 14.8942), 10.5, 2.3, 1.08, 0.72);

const shell: Form = (u, index, time) => {
  const height = 1 - 2 * u;
  const angle = ((index % 14) / 14) * TAU + height * sin(time * 1.1) * 3.1 + time * 0.8;
  const ring = sqrt(1 - height * height) * 1.34;
  const band = glow(fract(height * 0.5 + 0.5 - time * 0.55) - 0.5, 0.1);
  return [ring * cos(angle), height * 1.34, ring * sin(angle), 14 + (height + 1) * 26 + 360, 0.7 + band * 2.6];
};

const helix: Form = (u, index, time) => {
  const kind = index % 3;
  const along = kind === 2 ? floor(u * 26) / 13 - 1 : u * 2 - 1;
  const angle = along * 6 + time * 0.7;
  const reach: number = (kind === 2 ? 1 - 2 * fract(index * 0.618) : 1 - kind * 2) * 0.82;
  const surge = glow(fract(u - time * 0.42 + kind * 0.37) - 0.5, 0.05);
  return [along * 3.05, cos(angle) * reach, sin(angle) * reach, kind === 2 ? 48 : 196 + kind * 124, (kind === 2 ? 0.8 : 1) + surge * 3.4];
};

const disc: Form = (u, index, time) => {
  const radius = u ** 0.6 * 3.1 + 0.05;
  const angle = (index % 3) * (TAU / 3) + log(radius) * 2.5 + (noise(index, 4) - 0.5) * (0.5 + radius * 0.2) + time * 0.42;
  const knot = noise(floor(radius * 7), index % 3) > 0.62 ? 1.5 : 1;
  return [radius * cos(angle), (noise(index, 5) - 0.5) * 0.2 * (1 + 1.6 * glow(radius, 0.5)), radius * sin(angle), 196 + radius * 46, knot * (0.86 + 3.6 * glow(radius, 0.38))];
};

const hypercube: Form = (u, index, time) => {
  const point: number[] = [0, 1, 2, 3].map((bit) => (index & (1 << bit) ? 1 : -1));
  const along = fract(u * 113) * 2 - 1;
  point[(index >> 4) & 3] = along;
  const [x, y, z, w] = point;
  const a = time * 0.95;
  const b = time * 0.6;
  const rx = x * cos(a) - w * sin(a);
  const rw = x * sin(a) + w * cos(a);
  const ry = y * cos(b) - z * sin(b);
  const rz = y * sin(b) + z * cos(b);
  const scale = 1.72 / (2.5 - rw * 0.8);
  const surge = glow(fract(along * 0.5 - time * 0.9 + (index & 15) * 0.31) - 0.5, 0.07);
  return [rx * scale, ry * scale, rz * scale, 285 - rw * 76, 0.42 + abs(along) ** 12 * 4.4 + surge * 3];
};

const coil: Form = (u, _index, time) => {
  const around = u * TAU + time * 0.42;
  const wind = u * TAU * 46 - time * 3;
  const reach = 1.72 + 0.66 * cos(wind);
  const surge = glow(fract(u * 3 - time * 0.8) - 0.5, 0.08);
  return [reach * cos(around), 0.66 * sin(wind), reach * sin(around), 170 + 150 * sin(around) ** 2, 0.72 + surge * 3];
};

const SWARM = 3400;

const morph =
  (first: Form, second: Form, rest = HOLD_S): Emit =>
  (time, plot, life) => {
    const phase = clamp((life - rest) / FADE_S);
    const yaw = sin(time * 0.34) * 0.62;
    const pitch = 0.42 + sin(time * 0.26) * 0.2;
    const yawCos = cos(yaw);
    const yawSin = sin(yaw);
    const pitchCos = cos(pitch);
    const pitchSin = sin(pitch);
    for (let index = 0; index < SWARM; index++) {
      const u = (index + 0.5) / SWARM;
      let [x, y, z, hue, power = 1] = phase < 1 ? first(u, index, time) : second(u, index, time);
      const blend = ease(clamp(phase * 1.6 - noise(index, 9) * 0.6));
      if (blend > 0 && phase < 1) {
        const [nextX, nextY, nextZ, nextHue, nextPower = 1] = second(u, index, time);
        const arc = sin(blend * Math.PI);
        const swirl = arc * 3.6;
        const squeeze = 1 - arc ** 1.5 * 0.9;
        const mixX = (x + (nextX - x) * blend) * squeeze;
        const mixZ = (z + (nextZ - z) * blend) * squeeze;
        x = mixX * cos(swirl) - mixZ * sin(swirl);
        z = mixX * sin(swirl) + mixZ * cos(swirl);
        y = (y + (nextY - y) * blend) * squeeze + (noise(index, 11) - 0.5) * arc * 0.5;
        hue += (nextHue - hue) * blend;
        power += (nextPower - power) * blend + arc * 1.4;
      }
      const turnedX = x * yawCos + z * yawSin;
      const turnedZ = z * yawCos - x * yawSin;
      const liftedY = y * pitchCos + turnedZ * pitchSin;
      const depth = turnedZ * pitchCos - y * pitchSin;
      const scale = 2.9 / (2.9 + depth * 0.55);
      plot(turnedX * scale, liftedY * scale, 0.26 * exp(-depth * 0.75) * power, hue);
    }
    const blast = (phase - 0.42) / 0.58;
    if (blast <= 0 || blast >= 1) return;
    for (let index = 0; index < 340; index++) {
      const angle = (index / 340) * TAU;
      const reach = (1 - (1 - blast) ** 2.4) * (3.3 + noise(index, 12) * 0.5);
      plot(cos(angle) * reach, sin(angle) * reach * 0.62, (1 - blast) ** 1.4 * 1.6, 44);
    }
  };

const solid = (form: Form): Emit => morph(form, form, Infinity);

const warp: Emit = (time, plot, life) => {
  const ramp = max(life, 0);
  const travel = time * 0.1 + ((ramp * ramp) / (1 + ramp)) * 0.42;
  const surge = ease(min(ramp / 1.3, 1));
  const jump = glow(life - 1.15, 0.2);
  for (let index = 0; index < 440; index++) {
    const angle = noise(index, 1) * TAU;
    const near = fract(noise(index, 2) + travel);
    const head = 0.08 + near ** 2.1 * 4.8;
    const length = head * (0.06 + surge * 0.68);
    const hue = 186 + noise(index, 3) * 104;
    const weight = near ** 1.2 * (1.2 + surge * 0.8);
    for (let segment = 0; segment < 14; segment++) {
      const reach = head - (length * segment) / 13;
      plot(cos(angle) * reach, sin(angle) * reach * 0.68, weight * (1 - segment / 14), hue + (reach - head) * 14);
    }
  }
  for (let index = 0; index < 150; index++) {
    const angle = index * 2.39996;
    const reach = sqrt(index / 150) * (0.3 + jump * 0.7 + sin(time * 11) * 0.03);
    plot(cos(angle) * reach, sin(angle) * reach * 0.68, 0.46 + jump * 0.8, 214);
  }
  const open = clamp((life - 1.1) / 0.9);
  if (open <= 0 || open >= 1) return;
  for (let index = 0; index < 300; index++) {
    const angle = (index / 300) * TAU;
    const reach = (1 - (1 - open) ** 2) * 3.9;
    plot(cos(angle) * reach, sin(angle) * reach * 0.68, (1 - open) ** 1.3 * 1.5, 250);
  }
};

const strands: Emit = (time, plot) => {
  const drift = time * 0.7;
  for (let index = 0; index < 190; index++) {
    let x = (noise(index, 1) - 0.5) * 7;
    let y = (noise(index, 2) - 0.5) * 3.4;
    for (let step = 0; step < 46; step++) {
      const field = sin(x * 1.1 + drift * 0.4) * 1.1 + cos(y * 2.2 - drift * 0.3) * 1.2 + sin((x + y) * 0.6 + drift * 0.2) * 0.7;
      const angle = atan2(y * 1.9, x) + 1.95 + field * 0.62;
      x += cos(angle) * 0.075;
      y += sin(angle) * 0.052;
      const pulse = 0.2 + sin(step * 0.2 - time * 3.2 + index * 1.3) ** 14 * 2.2;
      plot(x, y, pulse * (1 - step / 46) ** 0.5, 196 + hypot(x, y * 1.9) * 42);
    }
  }
};

const ribbons: Emit = (time, plot) => {
  for (let band = 0; band < 2; band++) {
    for (let line = 0; line < 11; line++) {
      const place = line / 10 - 0.5;
      for (let step = 0; step < 190; step++) {
        const x = (step / 189 - 0.5) * 6.7;
        const center = sin(x * 0.85 + time * 0.95 + band * 2.5) * 0.74 + sin(x * 2.1 - time * 0.8 + band) * 0.2;
        const twist = x * 1.35 + time * 1.5 + band * 1.9;
        const spread = 1.05 + 0.3 * sin(x * 0.8 - time * 0.6 + band);
        const y = center + cos(twist) * place * spread;
        const sheen = sin(twist) * place * 2;
        const glint = glow(fract(x * 0.15 - time * 0.55 + band * 0.5) - 0.5, 0.07);
        plot(x, y, (0.15 + (sheen + 1) ** 2 * 0.1) * (1 + glint * 3.4), (band ? 318 : 214) - line * 7 + x * 20);
      }
    }
  }
};

const prism: Shade = (x, y, time) => {
  const radius = hypot(x, y);
  const sector = TAU / 8;
  const angle = atan2(y, x) + time * 0.34;
  const fold = abs(angle - sector * floor(angle / sector) - sector / 2);
  const zoom = 1 + sin(time * 1.3) * 0.12;
  const u = radius * cos(fold) * zoom;
  const v = radius * sin(fold) * zoom;
  const weave = sin(u * 5.5 - time * 2 + sin(v * 7 + time * 1.4)) * cos(v * 8 + time * 1.2 + radius * 3);
  const wave = glow(radius - fract(time * 0.66) * 4.4, 0.34);
  const facet = clamp(1 - abs(weave) * 2) ** 1.5;
  return facet * glow(radius, 2.5) * (0.95 + wave * 1.5) + glow(radius, 0.24) * 1.2;
};

const SYMBOLS: ((u: number, v: number) => number)[] = [
  (u, v) => max(clamp((0.25 - abs(v - 0.61)) * 7) * clamp((0.82 - abs(u)) * 7), clamp((0.33 - abs(u - v * 0.62 - 0.26)) * 7) * clamp((0.86 - v) * 7) * clamp((v + 0.86) * 7)),
  (u, v) => (hypot(u, v) < 0.78 ? (hypot(u, v) < 0.5 ? 0.5 : 1) : 0),
  (u, v) => clamp((0.86 - abs(u) * 0.9 - abs(v)) * 6) * (u * v > 0 ? 1 : 0.62),
  (u, v) => clamp(-(((u * 1.2) ** 2 + (v * 1.2 + 0.12) ** 2 - 1) ** 3 - (u * 1.2) ** 2 * (v * 1.2 + 0.12) ** 3) * 5),
];
const SYMBOL_HUES = [12, 44, 186, 340];
const STRIP = 32;
const REEL_STOPS = [0.65, 1.2, 1.95];
const REEL_BRAKES = [0.42, 0.42, 0.8];
const REEL_SHAKES = [0.05, 0.05, 0.16];
const REEL_SPEED = 8.5;
const BURST_HUES = [46, 192, 276, 330];
const COIN_COUNT = 260;
const REEL_GAP = 1.64;
const SYMBOL_GAP = 1.3;
const WIN_S = REEL_STOPS[2];

const dealStrip = (): Uint8Array => {
  const strip = new Uint8Array(STRIP);
  for (let cell = 1; cell < STRIP; cell++) {
    const nearPayline = cell < 3 || cell > STRIP - 3;
    do strip[cell] = floor(Math.random() * SYMBOLS.length);
    while (strip[cell] === strip[cell - 1] || (nearPayline && strip[cell] === 0));
  }
  return strip;
};

let strips = REEL_STOPS.map(() => dealStrip());
let spin = 0;
let lastLife = -Infinity;

const respin = (life: number): void => {
  if (life < lastLife) {
    strips = REEL_STOPS.map(() => dealStrip());
    spin++;
  }
  lastLife = life;
};

const reelPosition = (reel: number, life: number): number => {
  const left = REEL_STOPS[reel] - life;
  const brake = REEL_BRAKES[reel];
  if (left <= 0) return sin(left * 24) * exp(left * 10) * 0.16;
  return left < brake ? (-REEL_SPEED * left * left) / (2 * brake) : -REEL_SPEED * (left - brake / 2);
};

const reels: Shade = (x, y, _time, life) => {
  const lift = y - 0.08;
  const won = life - WIN_S;
  const reel = floor((x + REEL_GAP * 1.5) / REEL_GAP);
  if (reel < 0 || reel > 2 || abs(lift) >= 1.3) return 0;
  const angle = asin(lift / 1.3);
  const left = REEL_STOPS[reel] - life;
  const blur = left > 0 ? min(left / REEL_BRAKES[reel], 1) * 0.15 : 0;
  const base = reelPosition(reel, life);
  const pop = won > 0 ? 1 + (1 - exp(-won * 11)) * 0.15 + sin(won * 15) * exp(-won * 4) * 0.12 + sin(won * 7) * 0.025 : 1;
  const u = (x - (reel - 1) * REEL_GAP) / 0.6 / pop;
  const strip = strips[reel];
  let sum = 0;
  let hue = 0;
  for (let sample = 0; sample < 4; sample++) {
    const place = (angle * 1.3 - base + (sample - 1.5) * blur) / SYMBOL_GAP + 0.5;
    const row = floor(place);
    const symbol = strip[((row % STRIP) + STRIP) % STRIP];
    const value = SYMBOLS[symbol](u, ((place - row - 0.5) * 2 * 1.08) / pop) * (symbol && won > 0 ? max(1 - won * 3.5, 0) : 1);
    sum += value;
    hue += value * (SYMBOL_HUES[symbol] + (symbol ? 0 : (0.9 - abs(lift)) * 34));
  }
  if (!sum) return 0;
  const landed = left <= 0 ? exp(left * 7) * 0.7 : 0;
  const sweep = won > 0 ? glow(x + lift * 0.5 + 3.8 - fract(won * 0.8) * 7.6, 0.42) * 0.8 : 0;
  const pulse = won > 0 ? 0.95 + sin(won * 9 - abs(x)) * 0.07 : 0.84;
  tint = hue / sum + (won > 0 ? sin(won * 6 + x * 1.4) * 8 : 0);
  return (sum / 4) * cos(angle) ** 1.4 * (pulse + landed + sweep);
};

const rays: Shade = (x, y, time, life) => {
  const lift = y - 0.08;
  const won = life - WIN_S;
  const reach = hypot(x, lift);
  const angle = atan2(lift, x);
  const front = clamp(sin(angle * 9 + time * 19) * 3.4 - 1);
  const back = clamp(sin(angle * 6 - time * 12 + 1) * 3 - 1.6);
  const clear = 0.08 + 0.92 * ease(clamp((hypot(x / 2.4, lift / 1.02) - 0.68) * 3.4));
  const fade = clear * glow(reach, 3.6) * min(won * 4, 1);
  const shock = max(glow(reach - won * 7.5, 0.3) * exp(-won * 1.8), won > 0.45 ? glow(reach - (won - 0.45) * 6, 0.22) * exp(-(won - 0.45) * 2.2) : 0);
  const flash = exp(-won * 7) * glow(reach, 3.4) * 1.2;
  const beam = max(front * 0.86, back * 0.5) * fade;
  tint = front * 0.86 > back * 0.5 ? 42 - reach * 9 : 318 + reach * 10;
  return beam + shock * 1.1 + flash;
};

const tease: Shade = (x, y, time, life) => {
  const rising = clamp((life - REEL_STOPS[1]) / (WIN_S - REEL_STOPS[1]));
  const box = max(abs(x - REEL_GAP) - 0.7, abs(y - 0.08) - 1.02);
  const chase = 0.5 + 0.5 * sin((x + y * 1.4) * 8 - time * 24);
  tint = 44;
  return glow(box, 0.08) * chase * rising * 0.95 + clamp(-box * 4) * rising * rising * 0.12;
};

const payout: Emit = (time, plot, life) => {
  const won = life - WIN_S;
  for (let reel = 0; reel < 3; reel++) {
    const landed = life - REEL_STOPS[reel];
    if (landed <= 0 || landed > 0.5) continue;
    for (let index = 0; index < 34; index++) {
      const seed = index + reel * 40 + spin * 131;
      const angle = noise(seed, 3) * TAU;
      const reach = 0.5 + (noise(seed, 4) * 1.2 + 0.2) * (1 - (1 - landed * 2) ** 3);
      plot((reel - 1) * REEL_GAP + cos(angle) * reach, 0.08 + sin(angle) * reach * 0.8 - landed * landed * 1.4, (1 - landed * 2) * 1.5, 46);
    }
  }
  if (won <= 0) return;
  for (let index = 0; index < COIN_COUNT; index++) {
    const seed = index + spin * 131;
    const flight = (won - (index % 4) * 0.34 - noise(seed, 2) * 0.28) * (0.62 + noise(seed, 1) * 0.5);
    if (flight < 0) continue;
    const age = fract(flight);
    const angle = noise(seed, 3) * TAU;
    const speed = 1.7 + noise(seed, 4) * 3;
    const x = cos(angle) * (0.5 + speed * age);
    const y = 0.08 + sin(angle) * (0.5 + speed * age) * 0.74 - age * age * 1.9;
    const flip = abs(cos(time * 13 + index)) * 0.09;
    const weight = 1.5 * (1 - age * 0.55);
    if (index % 3) {
      plot(x - flip, y, weight, 38);
      plot(x + flip, y, weight, 46);
    } else {
      plot(x, y, weight * 1.5 * abs(sin(time * 19 + index * 1.7)), 30 + noise(seed, 5) * 18);
    }
  }
  for (let burst = 0; burst < 7; burst++) {
    const start = burst * 0.36 + 0.12 + noise(burst, spin + 7) * 0.16;
    const age = (won - start) / 0.95;
    if (age <= 0 || age >= 1) continue;
    const centerX = (noise(burst, spin + 1) - 0.5) * 5.4;
    const centerY = 0.1 + (noise(burst, spin + 2) - 0.5) * 2.3;
    const hue = BURST_HUES[floor(noise(burst, spin + 3) * BURST_HUES.length)];
    const open = 1 - (1 - age) ** 3;
    const size = 0.8 + noise(burst, spin + 4) * 0.7;
    for (let spark = 0; spark < 80; spark++) {
      const angle = spark * 2.39996;
      const reach = (0.82 + noise(spark, burst) * 0.42) * size * open;
      plot(centerX + cos(angle) * reach, centerY + sin(angle) * reach * 0.82 - age * age * 0.55, (1 - age) ** 1.3 * 1.5, hue + (spark % 5) * 6);
    }
  }
};

const coins = swarm(payout);

const shake = (life: number): number => {
  let offset = 0;
  for (let reel = 0; reel < 3; reel++) {
    const landed = life - REEL_STOPS[reel];
    if (landed > 0) offset += sin(landed * 58) * exp(-landed * 9) * REEL_SHAKES[reel];
  }
  return offset;
};

const slots: Shade = (x, y, time, life) => {
  respin(life);
  const won = life - WIN_S;
  const offset = shake(life);
  const symbol = reels(x + offset * 0.7, y + offset, time, life);
  if (symbol > 0.3) return symbol;
  const symbolHue = tint;
  const spark = coins(x, y, time, life);
  const sparkHue = tint;
  const backdrop = won > 0 ? rays(x, y, time, life) : tease(x, y, time, life);
  if (spark > 0.32 && spark >= backdrop * 0.8) {
    tint = sparkHue;
    return spark;
  }
  if (backdrop > symbol) return backdrop;
  tint = symbolHue;
  return symbol;
};

const aurora: Shade = (x, y, time) => {
  let sum = 0;
  let curtain = 0;
  for (let layer = 0; layer < 3; layer++) {
    const shift = layer * 2.3;
    const base = -0.42 + layer * 0.2 + 0.62 * sin(x * 0.8 + time * 0.55 + shift) + 0.24 * sin(x * 2.2 - time * 0.9 + shift * 2) + 0.07 * sin(x * 6 + time * 1.7 + shift);
    const lift = y - base;
    if (lift < -0.1) continue;
    const fan = x * (1 - lift * 0.13);
    const folds = fan * 1.5 + sin(fan * 2.4 + time * 0.7 + shift) * 0.55 + sin(fan * 5.3 - time) * 0.18;
    const rays = 0.5 + 0.5 * sin(folds * 12 + time * 2.6 + sin(fan * 19 + shift) * 0.6);
    const sweep = 0.72 + 0.48 * sin(x * 1.4 - time * 3 + layer * 2.1);
    const height = 1.05 + layer * 0.28 + sin(x * 1.3 + time * 0.8 + shift) * 0.3;
    const light = clamp((lift + 0.1) * 9) * exp(-max(lift, 0) * (2.4 / height)) * (0.24 + rays ** 2 * 0.92) * sweep;
    if (light > sum) curtain = lift;
    sum = max(sum, light) + min(sum, light) * 0.5;
  }
  tint = curtain < 0.1 ? 322 + curtain * 300 : 138 + min(curtain * 58, 150);
  return min(sum, 1.2);
};

const corona: Emit = (time, plot, life) => {
  const eruption = max(life, 0) * 0.9;
  const blastAngle = time * 0.21;
  for (let index = 0; index < 3000; index++) {
    const start = noise(index, 1) * TAU;
    const age = fract(noise(index, 2) * 3 + time * (0.2 + noise(index, 3) * 0.24));
    const lane = (0.5 + 0.5 * sin(start * 9 + sin(start * 4 + time * 0.7) * 2)) ** 1.7;
    const gust = 1 + glow(sin((start - blastAngle) / 2), 0.2) * glow(eruption - 0.9, 0.7) * 1.1;
    const radius = 0.72 + age ** 1.2 * (0.34 + lane * 4.1) * gust;
    const angle = start + age * 0.7;
    plot(cos(angle) * radius, sin(angle) * radius, (1 - age) ** 0.9 * (0.2 + lane * 0.95), 6 + (1 - age) ** 2 * 50);
  }
  for (let loop = 0; loop < 6; loop++) {
    const foot = loop * 1.05 + time * 0.07 + sin(loop * 2.7) * 0.4;
    const height = 0.3 + 0.22 * sin(time * 1.6 + loop * 1.9);
    for (let step = 0; step < 64; step++) {
      const along = step / 63;
      const angle = foot + (along - 0.5) * 0.66;
      const radius = 0.7 + sin(along * Math.PI) * height;
      const rush = 0.6 + 0.4 * sin(along * 16 - time * 9 + loop);
      plot(cos(angle) * radius, sin(angle) * radius, 0.8 * rush, 340);
    }
  }
  const diamond = time * 0.5 + 0.8;
  for (let index = 0; index < 260; index++) {
    const angle = (index / 260) * TAU;
    plot(cos(angle) * 0.68, sin(angle) * 0.68, 0.3 + glow(sin((angle - diamond) / 2), 0.34) * 1.6, 44);
  }
  const glintX = cos(diamond) * 0.72;
  const glintY = sin(diamond) * 0.72;
  const shine = 1 + sin(time * 6) * 0.25;
  for (let index = 0; index < 110; index++) {
    const angle = index * 2.39996;
    const radius = sqrt(index / 110) * 0.26;
    plot(glintX + cos(angle) * radius, glintY + sin(angle) * radius, 1.9 * shine, 52);
    const reach = (index / 110) ** 1.4 * 1.5;
    const fade = (1 - index / 110) ** 2 * 1.5 * shine;
    plot(glintX + reach, glintY, fade, 52);
    plot(glintX - reach, glintY, fade, 52);
    plot(glintX, glintY + reach * 0.5, fade, 52);
    plot(glintX, glintY - reach * 0.5, fade, 52);
  }
};

const hole: Emit = (time, plot, life) => {
  const flare = life > 0.5 ? 1 + exp((0.5 - life) * 2) * 1.2 : 1;
  for (let index = 0; index < 3200; index++) {
    const fall = fract(noise(index, 1) + time * 0.14);
    const radius = 3.05 - fall ** 0.72 * 2.3;
    const angle = (floor(noise(index, 2) * 13) / 13) * TAU + (noise(index, 3) - 0.5) * 0.46 + fall * fall * 8 + time * 1.7;
    const across = radius * cos(angle);
    const away = radius * sin(angle);
    const offset = hypot(across, away * 0.15);
    const bend = away > 0 ? (1 + sqrt(1 + (1.32 / offset) ** 2)) / 2 : 1;
    const heat = 1 - radius / 3.05;
    const beam = 1 - cos(angle) * 0.62;
    plot(across * bend, away * 0.15 * bend, (0.09 + heat ** 1.5 * 0.42) * beam * min(fall * 9, 1) * flare, 6 + heat * 52 + beam * 4);
  }
  for (let index = 0; index < 300; index++) {
    const angle = (index / 300) * TAU;
    const lean = 0.8 - cos(angle) * 0.5;
    plot(cos(angle) * 0.68, sin(angle) * 0.68, lean * flare, 44);
  }
};

const planet: Shade = (x, y, time, life) => {
  const sunAngle = 2.8 - max(life, 0) * 0.3;
  const sunX = cos(sunAngle);
  const sunY = sin(sunAngle);
  const orbitX = x * 0.965 + y * 0.26;
  const orbitZ = (y * 0.965 - x * 0.26) / 0.3;
  const ring = hypot(orbitX, orbitZ);
  const u = x / 1.12;
  const v = y / 1.12;
  const reach = hypot(u, v);
  let band = 0;
  if (ring > 1.46 && ring < 3.05) {
    const grooves = 0.74 + 0.26 * sin(ring * 30 + sin(ring * 7) * 2.6);
    const shimmer = 0.8 + 0.2 * sin(atan2(orbitZ, orbitX) * 6 - time * 3.6 + ring * 9);
    const cassini = 0.08 + 0.92 * clamp(abs(ring - 2.42) * 13);
    const rim = clamp((ring - 1.46) * 9) * clamp((3.05 - ring) * 6);
    const away = orbitX * sunX + orbitZ * 0.42;
    const cover = away < 0 && abs(orbitX * 0.42 - orbitZ * sunX) < 0.72 ? 0.28 : 1;
    band = grooves * shimmer * cassini * rim * cover * 0.86;
  }
  if (reach >= 1 || (orbitZ < 0 && band > 0.16)) {
    const limb = reach >= 1 ? glow(reach - 1, 0.14) * clamp((u * sunX + v * sunY) * 1.4 + 0.5) : 0;
    tint = band > limb ? 20 + ring * 8 : 214;
    return max(band, limb);
  }
  const depth = sqrt(1 - reach * reach);
  const flatX = u * 0.965 + v * 0.26;
  const flatY = v * 0.965 - u * 0.26;
  const longitude = atan2(flatX, depth) + time * 0.8;
  const bands = sin(flatY * 15 + sin(longitude * 2 + flatY * 6) * 2 + sin(longitude * 5 - time * 1.4 + flatY * 9) * 0.7);
  const light = u * sunX + v * sunY;
  const sun = clamp((light + depth * 0.62) * 1.9);
  const cast = 1 - glow(flatY - 0.13, 0.07) * 0.85;
  tint = 262 - light * 62 + bands * 30;
  return max((0.5 + bands * 0.5) ** 1.3 * sun * cast, (1 - depth) ** 3.4 * clamp(light + 0.7) * 1.1, clamp(1 - abs(bands) * 5) * depth * 0.42 * sun);
};

const fire: Emit = (time, plot, life) => {
  const whoosh = 1 + exp(-max(life, 0) * 1.7) * 0.85;
  for (let index = 0; index < 3400; index++) {
    const source = index % 11;
    const side = source - 5;
    const lick = sin(time * (2.6 + source * 0.53) + source * 2.3) * 0.5 + sin(time * (5.1 - source * 0.31) + source) * 0.28;
    const reach = (2.1 + lick * 1.3) * (1.62 - abs(side) * 0.2) * whoosh;
    const age = fract(noise(index, 1) + time * (0.9 + noise(index, 2) * 0.6));
    const spread = (noise(index, 3) - 0.5) * 0.46 * (1 - age) ** 0.5;
    const sway = (sin(age * 5 - time * 7 + source) * 0.24 + sin(age * 13 - time * 12 + source * 2) * 0.09) * age;
    plot(side * 0.37 + spread + sway, -1.5 + side * side * 0.028 + age * reach, min(age * 8, 1) * (1 - age) ** 1.1 * 0.8, 58 - age ** 0.8 * 66);
  }
  for (let index = 0; index < 220; index++) {
    const age = fract(noise(index, 7) + time * (0.34 + noise(index, 8) * 0.4));
    const x = (noise(index, 9) - 0.5) * 5.6 + sin(age * 8 + index + time) * 0.36;
    plot(x, -1.1 + age * 2.9, (1 - age) ** 1.1 * (1 + abs(sin(time * 9 + index)) * 1.4), 22 + noise(index, 10) * 20);
  }
};

const plasma: Emit = (time, plot, life) => {
  const flicker = floor(time * 18);
  const strike = floor(time * 3.1) % 12;
  const charge = 1 + exp(-max(life, 0) * 2) * 0.8;
  for (let arc = 0; arc < 12; arc++) {
    const hero = arc === strike ? 2.3 : 1;
    let angle = arc * 1.047 + sin(time * 0.5 + arc * 2.4) * 0.5 + time * 0.22;
    let x = 0;
    let y = 0;
    for (let step = 0; step < 60; step++) {
      angle += (noise(arc * 31 + step, 1) - 0.5) * 0.8 + (noise(arc * 31 + step, flicker) - 0.5) * 0.46;
      x += cos(angle) * 0.07;
      y += sin(angle) * 0.052;
      plot(x, y, 1.2 * (1 - step / 78) * hero * charge, 262 + step * 1.4 - arc * 5);
      if (step % 13 === 8) {
        let forkAngle = angle + (noise(arc + step, flicker) - 0.5) * 2.2;
        let forkX = x;
        let forkY = y;
        for (let branch = 0; branch < 14; branch++) {
          forkAngle += (noise(arc * 7 + step + branch, flicker + 3) - 0.5) * 1.2;
          forkX += cos(forkAngle) * 0.06;
          forkY += sin(forkAngle) * 0.045;
          plot(forkX, forkY, 0.62 * (1 - branch / 14) * hero, 296 + branch * 2);
        }
      }
    }
    for (let index = 0; index < 18; index++) {
      const spray = noise(index, arc) * TAU;
      const reach = noise(index, arc + flicker) * 0.17 * hero;
      plot(x + cos(spray) * reach, y + sin(spray) * reach, 1.05, 320);
    }
  }
  for (let index = 0; index < 170; index++) {
    const angle = index * 2.39996;
    const radius = sqrt(index / 170) * 0.32 * (1 + sin(time * 9) * 0.12);
    plot(cos(angle) * radius, sin(angle) * radius, 0.9, 300);
  }
};

const waves: Shade = (x, y, time) => {
  const away = 2.3 / (2.3 - y);
  const planeX = x * away;
  const planeY = away * 4.2 - 3;
  let crest = 0;
  for (let source = 0; source < 3; source++) {
    const angle = time * 0.6 + (source * TAU) / 3;
    crest += sin(hypot(planeX - cos(angle) * 1.5, planeY - sin(angle) * 1.1) * 7.5 - time * 5);
  }
  tint = hypot(planeX, planeY) * 86 - time * 70;
  return ((crest + 3) / 6) ** 1.8 * glow(hypot(x * 0.36, y * 0.56), 1.6) * 1.35;
};

const SCENES = {
  suns: swarm(solid(moth)),
  prism,
  warp: swarm(warp),
  orbits: swarm(morph(disc, shell)),
  hole: swarm(hole),
  strings: swarm(morph(helix, coil)),
  corona: swarm(corona),
  plasma: swarm(plasma),
  slots,
  strands: swarm(strands),
  hypercube: swarm(solid(hypercube)),
  fire: swarm(fire),
  aurora,
  ribbons: swarm(ribbons),
  waves,
  planet,
  empty: () => 0,
};

export type SceneName = keyof typeof SCENES | 'dust';

type Visit = (col: number, row: number, value: number, name: SceneName, x: number, y: number, hue: number) => void;

const NAMES = Object.keys(SCENES) as (keyof typeof SCENES)[];

const LONG_HOLD_S = HOLD_S * 2 + FADE_S;
const HOLDS: Partial<Record<SceneName, number>> = { suns: 4.1, orbits: LONG_HOLD_S, strings: LONG_HOLD_S, slots: 5 };

export const holdOf = (scene: number): number => HOLDS[NAMES[scene]] ?? HOLD_S;

export const SCENE_COUNT = NAMES.length - 1;

const WIPES: Wipe[] = [
  (_x, _y, grain) => grain,
  (x, y, grain) => (hypot(x, y) / 3.4) * 0.86 + grain * 0.14,
  (x, y, grain) => (1 - hypot(x, y) / 3.4) * 0.86 + grain * 0.14,
  (x, _y, grain) => ((x + 3.3) / 6.6) * 0.8 + grain * 0.2,
  (x, y, grain) => fract(atan2(y, x) / TAU + hypot(x, y) * 0.3) * 0.86 + grain * 0.14,
];

export const WIPE_COUNT = WIPES.length;

export const levelOf = (value: number): number => clamp(floor(value * RAMP.length), 0, RAMP.length - 1);

const edge = (x: number, y: number, time: number): number => {
  const angle = atan2(y - 0.1, x);
  const reach = hypot(x / 3.25, (y - 0.1) / 1.6);
  const wobble = 0.05 + 0.03 * sin(angle * 3 + time * 0.7) + 0.02 * sin(angle * 5 - time * 0.5);
  return clamp((1 - reach - wobble) * 2.8);
};

const MOTES = 56;

const eachMote = (time: number, visit: Visit): void => {
  for (let index = 0; index < MOTES; index++) {
    const x = (fract(noise(index, 1) + time * 0.012 * (noise(index, 2) - 0.5)) - 0.5) * 6.4;
    const y = (fract(noise(index, 3) + time * 0.03 * (0.4 + noise(index, 4))) - 0.5) * 3.2;
    const twinkle = 0.5 + 0.5 * sin(time * (1 + noise(index, 5) * 2) + index);
    visit(x / CELL + COLS / 2, ROWS / 2 - y / STEP, 0.34 * twinkle * edge(x, y, time), 'dust', x, y, 0);
  }
};

export function eachCell(frame: Frame, visit: Visit): void {
  const { from, to, progress, time, wipe, life = 0, origin } = frame;
  const arrival = (progress - 1) * FADE_S;
  const order: Wipe = origin ? (x, y, grain) => (hypot(x - origin[0], y - origin[1]) / (3.7 + hypot(...origin))) * 0.86 + grain * 0.14 : WIPES[wipe];
  const first = NAMES[from];
  const second = NAMES[to];
  eachMote(time, visit);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = (col + 0.5 - COLS / 2) * CELL;
      const y = (ROWS / 2 - row - 0.5) * STEP;
      const fade = edge(x, y, time);
      if (fade <= 0) continue;
      const grain = noise(col, row);
      const age = (progress - order(x, y, grain) * (1 - FLIGHT)) / FLIGHT;
      const flipped = progress && age >= 0;
      const value = (flipped ? SCENES[second](x, y, time, arrival) : SCENES[first](x, y, time, life)) * fade;
      const flare = progress && age > -0.7 && age < 0.7 ? (1 - abs(age) / 0.7) * 0.5 : 0;
      visit(col, row, value + (value > 0.08 ? flare : 0), flipped ? second : first, x, y, tint);
      if (flipped && age < 1) {
        const left = SCENES[first](x, y, time, life) * fade * (1 - age);
        if (left > 0.1) {
          const flight = age * age * 2.4;
          const driftX = (x * 0.42 + (grain - 0.5) * 1.6) * flight;
          const driftY = (y * 0.42 + (noise(row, col) - 0.5) * 1.2 + 0.25) * flight;
          visit(col + driftX / CELL, row - driftY / STEP, left, first, x, y, tint);
        }
      }
    }
  }
}
