export const COLS = 110;
export const ROWS = 34;

type Shade = (x: number, y: number, time: number, life: number) => number;
type Plot = (x: number, y: number, weight: number, hue: number) => void;
type Emit = (time: number, plot: Plot, life: number) => void;
type Form = (u: number, index: number, time: number) => [x: number, y: number, z: number, hue: number];
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

const { abs, asin, atan2, cos, exp, floor, hypot, log, max, min, sin, sqrt } = Math;

const clamp = (value: number, low = 0, high = 1): number => min(high, max(low, value));
const fract = (value: number): number => value - floor(value);
const ease = (value: number): number => value * value * (3 - 2 * value);
const noise = (a: number, b: number): number => fract(sin(a * 12.9898 + b * 78.233) * 43758.5453);
const glow = (distance: number, width: number): number => exp(-((distance / width) ** 2));

export let tint = 0;

const swarm = (emit: Emit): Shade => {
  const amounts = new Float32Array(COLS * ROWS);
  const hues = new Float32Array(COLS * ROWS);
  let stamp = NaN;
  const add = (cell: number, weight: number, hue: number): void => {
    amounts[cell] += weight;
    hues[cell] += weight * hue;
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
      hues.fill(0);
      emit(time, plot, life);
    }
    const col = clamp(floor(x / CELL + COLS / 2), 0, COLS - 1);
    const row = clamp(floor(ROWS / 2 - y / STEP), 0, ROWS - 1);
    const amount = amounts[row * COLS + col];
    tint = amount ? hues[row * COLS + col] / amount : 0;
    return 1 - exp(-amount);
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

const SUN_HUES = [38, 334, 192];

const trio =
  (orbit: Float32Array, seconds: number, wide: number, tall: number, reach: number): Form =>
  (u, index, time) => {
    const sun = u < 0.2;
    const tail = sun ? 0 : ((u - 0.2) / 0.8) ** 1.8 * reach;
    const sample = floor(fract(time / seconds - tail) * ORBIT_SAMPLES) * 6 + (index % 3) * 2;
    const angle = noise(index, 2) * TAU;
    const spread = sun ? noise(index, 1) ** 2 * 0.15 : 0.015;
    return [orbit[sample] * wide + cos(angle) * spread, orbit[sample + 1] * tall + sin(angle) * spread, tail * 3.4, SUN_HUES[index % 3]];
  };

const moth = trio(solveOrbit(0.464445, 0.39606, 14.8942), 14, 2.15, 1.02, 0.75);

const shell: Form = (u, index, time) => {
  const height = 1 - 2 * u;
  const angle = ((index % 12) / 12) * TAU + height * sin(time * 0.9) * 2.6 + time * 0.5;
  const ring = sqrt(1 - height * height) * 1.22;
  return [ring * cos(angle), height * 1.22, ring * sin(angle), 18 + (height + 1) * 24];
};

const helix: Form = (u, index, time) => {
  const kind = index % 3;
  const along = kind === 2 ? floor(u * 26) / 13 - 1 : u * 2 - 1;
  const angle = along * 6 + time * 0.38;
  const reach: number = (kind === 2 ? 1 - 2 * fract(index * 0.618) : 1 - kind * 2) * 0.68;
  return [along * 2.8, cos(angle) * reach, sin(angle) * reach, kind === 2 ? 48 : 196 + kind * 124];
};

const disc: Form = (u, index, time) => {
  const radius = sqrt(u) * 2.9 + 0.06;
  const angle = (index % 3) * (TAU / 3) + log(radius) * 2.3 + (noise(index, 4) - 0.5) * 1.1 + time * 0.22;
  return [radius * cos(angle), (noise(index, 5) - 0.5) * 0.22, radius * sin(angle), 205 + radius * 45];
};

const hypercube: Form = (u, index, time) => {
  const point: number[] = [0, 1, 2, 3].map((bit) => (index & (1 << bit) ? 1 : -1));
  point[(index >> 4) & 3] = fract(u * 113) * 2 - 1;
  const [x, y, z, w] = point;
  const a = time * 0.75;
  const b = time * 0.42;
  const rx = x * cos(a) - w * sin(a);
  const rw = x * sin(a) + w * cos(a);
  const ry = y * cos(b) - z * sin(b);
  const rz = y * sin(b) + z * cos(b);
  const scale = 1.25 / (2.5 - rw * 0.8);
  return [rx * scale, ry * scale, rz * scale, 285 - rw * 70];
};

const coil: Form = (u, _index, time) => {
  const around = u * TAU + time * 0.3;
  const wind = u * TAU * 46 - time * 2;
  const reach = 1.5 + 0.56 * cos(wind);
  return [reach * cos(around), 0.56 * sin(wind), reach * sin(around), 170 + 150 * sin(around) ** 2];
};

const SWARM = 2000;

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
      let [x, y, z, hue] = phase < 1 ? first(u, index, time) : second(u, index, time);
      const blend = ease(clamp(phase * 1.6 - noise(index, 9) * 0.6));
      if (blend > 0 && phase < 1) {
        const [nextX, nextY, nextZ, nextHue] = second(u, index, time);
        const arc = sin(blend * Math.PI);
        const swirl = arc * 2.2;
        const mixX = x + (nextX - x) * blend;
        const mixZ = z + (nextZ - z) * blend;
        x = mixX * cos(swirl) - mixZ * sin(swirl);
        z = mixX * sin(swirl) + mixZ * cos(swirl);
        y += (nextY - y) * blend + (noise(index, 11) - 0.5) * arc * 1.2;
        hue += (nextHue - hue) * blend;
      }
      const turnedX = x * yawCos + z * yawSin;
      const turnedZ = z * yawCos - x * yawSin;
      const liftedY = y * pitchCos + turnedZ * pitchSin;
      const depth = turnedZ * pitchCos - y * pitchSin;
      const scale = 2.9 / (2.9 + depth * 0.55);
      plot(turnedX * scale, liftedY * scale, 0.3 * exp(-depth * 0.75), hue);
    }
  };

const solid = (form: Form): Emit => morph(form, form, Infinity);

const warp: Emit = (time, plot) => {
  for (let index = 0; index < 300; index++) {
    const angle = noise(index, 1) * TAU;
    const depth = fract(noise(index, 2) + time * 0.46);
    const radius = 0.05 + depth ** 2.4 * 4.4;
    const hue = 188 + noise(index, 3) * 96;
    for (let segment = 0; segment < 7; segment++) {
      const reach = radius * (1 - segment * 0.055);
      plot(cos(angle) * reach, sin(angle) * reach * 0.7, depth ** 1.4 * 1.5 * (1 - segment / 7), hue);
    }
  }
};

const attractor: Emit = (seconds, plot) => {
  const time = seconds * 0.7;
  const a = 1.7 + sin(time * 0.31) * 0.18;
  const b = -1.95 + cos(time * 0.23) * 0.18;
  const c = 0.94 + sin(time * 0.37) * 0.18;
  const d = 1.57 + cos(time * 0.29) * 0.18;
  let x = 0.1;
  let y = 0.1;
  for (let index = 0; index < 9000; index++) {
    const nextX = sin(a * y) + c * cos(a * x);
    y = sin(b * x) + d * cos(b * y);
    x = nextX;
    plot(x * 1.34, y * 0.58, 0.056, 262 + x * 44 + y * 30);
  }
};

const strands: Emit = (time, plot) => {
  const drift = time * 0.45;
  for (let index = 0; index < 64; index++) {
    let x = (noise(index, 1) - 0.5) * 6.2;
    let y = (noise(index, 2) - 0.5) * 3;
    for (let step = 0; step < 30; step++) {
      const angle = sin(x * 1.1 + drift * 0.4) * 1.6 + cos(y * 2.2 - drift * 0.3) * 1.8 + sin((x + y) * 0.6 + drift * 0.2);
      x += cos(angle) * 0.075;
      y += sin(angle) * 0.075;
      const pulse = 0.35 + 0.65 * sin(step * 0.5 - time * 4 + index) ** 2;
      plot(x, y, pulse * (1 - step / 30) * 0.8, 150 + angle * 34);
    }
  }
};

const ribbons: Emit = (time, plot) => {
  for (let line = 0; line < 10; line++) {
    for (let step = 0; step < 150; step++) {
      const x = (step / 149 - 0.5) * 6.4;
      const swing = sin(x * (1 + line * 0.07) + time * (0.7 + line * 0.06) + line * 0.6) * (0.62 + 0.32 * sin(time * 0.42 + line));
      const y = swing + sin(x * 2.3 - time * 1.7 + line) * 0.22;
      plot(x, y, 0.42, 300 - line * 13 + x * 22);
    }
  }
};

const julia: Shade = (x, y, time) => {
  const angle = 1.8 + sin(time * 0.33) * 0.9;
  const cReal = 0.7885 * cos(angle);
  const cImag = 0.7885 * sin(angle);
  let real = x * 0.5;
  let imag = y * 0.72;
  for (let step = 0; step < 32; step++) {
    const size = real * real + imag * imag;
    if (size > 16) return clamp((step + 1 - log(log(size) * 0.5) / log(2) - 3.5) / 11) ** 1.5 * 0.8;
    const next = real * real - imag * imag + cReal;
    imag = 2 * real * imag + cImag;
    real = next;
  }
  return 0;
};

const silk: Shade = (x, y, time) => {
  const drift = time * 0.28;
  const a = sin(x * 1.3 + drift * 0.5) + sin(y * 2.1 - drift * 0.4);
  const b = sin(x * 1.7 - drift * 0.3 + a) + cos(y * 2.6 + drift * 0.6 + a);
  return clamp(1 - abs(sin(x * 2.2 + b * 1.4 + drift * 0.3) * cos(y * 3 - a * 1.5)) * 3.4) ** 1.7;
};

const prism: Shade = (x, y, time) => {
  const radius = hypot(x, y);
  const sector = TAU / 8;
  const angle = atan2(y, x) + time * 0.18;
  const fold = abs(angle - sector * floor(angle / sector) - sector / 2);
  const u = radius * cos(fold);
  const v = radius * sin(fold);
  const weave = sin(u * 5.5 - time * 1.4 + sin(v * 7 + time)) * cos(v * 8 + time * 0.8 + radius * 3);
  return clamp(1 - abs(weave) * 2.6) * glow(radius, 1.9);
};

const SYMBOLS: ((u: number, v: number) => number)[] = [
  (u, v) => max(clamp((0.2 - abs(v - 0.66)) * 7) * clamp((0.78 - abs(u)) * 7), clamp((0.27 - abs(u - v * 0.62 - 0.3)) * 7) * clamp((0.86 - v) * 7) * clamp((v + 0.86) * 7)),
  (u, v) => (hypot(u, v) < 0.78 ? (hypot(u, v) < 0.5 ? 0.5 : 1) : 0),
  (u, v) => clamp((0.86 - abs(u) * 0.9 - abs(v)) * 6) * (u * v > 0 ? 1 : 0.62),
  (u, v) => clamp(-(((u * 1.2) ** 2 + (v * 1.2 + 0.12) ** 2 - 1) ** 3 - (u * 1.2) ** 2 * (v * 1.2 + 0.12) ** 3) * 5),
];
const SYMBOL_HUES = [12, 44, 186, 340];
const DRUM = [0, 3, 2, 1, 0, 2, 3, 1, 0, 1, 3, 2];
const REEL_STOPS = [0.7, 1.3, 1.9];
const REEL_SPEED = 8.5;
const REEL_BRAKE = 0.42;
const SYMBOL_GAP = 1.3;
const WIN_S = REEL_STOPS[2];

const reelPosition = (reel: number, life: number): number => {
  const left = REEL_STOPS[reel] - life;
  if (left <= 0) return sin(left * 24) * exp(left * 10) * 0.16;
  return left < REEL_BRAKE ? (-REEL_SPEED * left * left) / (2 * REEL_BRAKE) : -REEL_SPEED * (left - REEL_BRAKE / 2);
};

const reels: Shade = (x, y, time, life) => {
  const lift = y - 0.08;
  const won = life - WIN_S;
  const reach = hypot(x, lift);
  const rays = won > 0 ? clamp(sin(atan2(lift, x) * 9 + time * 2.4) * 2.4 - 0.5) * clamp(reach - 0.3) * glow(reach, 2.4) * min(won * 3, 1) * 0.26 : 0;
  tint = 350;
  const reel = floor((x + 2.46) / 1.64);
  if (reel < 0 || reel > 2 || abs(lift) >= 1.3) return rays;
  const angle = asin(lift / 1.3);
  const left = REEL_STOPS[reel] - life;
  const blur = left > 0 ? min(left / REEL_BRAKE, 1) * 0.15 : 0;
  const base = reelPosition(reel, life);
  const pop = won > 0 ? 1 + (1 - exp(-won * 11)) * 0.16 + sin(won * 15) * exp(-won * 5) * 0.1 : 1;
  const u = (x - (reel - 1) * 1.64) / 0.6 / pop;
  let sum = 0;
  let hue = 0;
  for (let sample = 0; sample < 4; sample++) {
    const place = (angle * 1.3 - base + (sample - 1.5) * blur) / SYMBOL_GAP + 0.5;
    const row = floor(place);
    const symbol = DRUM[((row % 12) + 12) % 12];
    const value = SYMBOLS[symbol](u, ((place - row - 0.5) * 2 * 1.08) / pop) * (symbol && won > 0 ? max(1 - won * 3.5, 0) : 1);
    sum += value;
    hue += value * (SYMBOL_HUES[symbol] + (symbol ? 0 : (0.9 - abs(lift)) * 34));
  }
  if (!sum) return rays;
  const glint = won > 0 ? 0.8 + 0.2 * sin(won * 8 - x * 2.2) : 0.84;
  const symbol = (sum / 4) * cos(angle) ** 1.4 * glint;
  if (symbol < rays) return rays;
  tint = hue / sum;
  return symbol;
};

const payout: Emit = (time, plot, life) => {
  const won = life - WIN_S;
  if (won <= 0) return;
  for (let index = 0; index < 110; index++) {
    const flight = (won - noise(index, 2) * 0.45) * (0.7 + noise(index, 1) * 0.5);
    if (flight < 0) continue;
    const age = fract(flight);
    const angle = noise(index, 3) * TAU;
    const speed = 1.5 + noise(index, 4) * 2.3;
    const x = cos(angle) * (0.8 + speed * age);
    const y = 0.08 + sin(angle) * (0.8 + speed * age) * 0.72 - age * age * 1.2;
    const flip = abs(cos(time * 11 + index)) * 0.07;
    const weight = 1.3 * (1 - age * 0.6);
    plot(x - flip, y, weight, 44);
    plot(x + flip, y, weight, 52);
  }
};

const coins = swarm(payout);

const slots: Shade = (x, y, time, life) => {
  const spark = coins(x, y, time, life);
  const sparkHue = tint;
  const reel = reels(x, y, time, life);
  if (spark <= reel || reel > 0.3) return reel;
  tint = sparkHue;
  return spark;
};

const aurora: Shade = (x, y, time) => {
  const base = -0.75 + 0.3 * sin(x * 1.1 + time * 0.4) + 0.16 * sin(x * 2.9 - time * 0.6);
  const lift = y - base;
  if (lift < 0) return 0;
  const folds = x * 1.4 + sin(x * 2.2 + time * 0.5) * 0.6 + sin(x * 5.1 - time * 0.7) * 0.2;
  const rays = 0.5 + 0.5 * sin(folds * 11 + time * 1.3 + sin(x * 19) * 0.6);
  return clamp(lift * 7) * exp(-lift * 1.35) * (0.34 + rays * 0.86);
};

const corona: Emit = (time, plot) => {
  for (let index = 0; index < 1500; index++) {
    const start = noise(index, 1) * TAU;
    const age = fract(noise(index, 2) * 3 + time * (0.16 + noise(index, 3) * 0.2));
    const lane = 0.5 + 0.5 * sin(start * 9 + sin(start * 4 + time * 0.5) * 2);
    const radius = 0.66 + age ** 1.3 * (0.5 + lane * 3);
    const angle = start + age * 0.8;
    plot(cos(angle) * radius, sin(angle) * radius, (1 - age) ** 1.2 * (0.3 + lane * 0.8), 8 + (1 - age) * 44);
  }
  for (let index = 0; index < 220; index++) {
    const angle = (index / 220) * TAU;
    plot(cos(angle) * 0.64, sin(angle) * 0.64, 0.7, 48);
  }
};

const hole: Emit = (time, plot) => {
  for (let index = 0; index < 1500; index++) {
    const fall = fract(noise(index, 1) + time * 0.11);
    const radius = 2.75 - fall ** 0.75 * 2.15;
    const angle = (floor(noise(index, 2) * 11) / 11) * TAU + (noise(index, 3) - 0.5) * 0.5 + fall * fall * 7 + time * 1.2;
    const across = radius * cos(angle);
    const away = radius * sin(angle);
    const offset = hypot(across, away * 0.13);
    const bend = away > 0 ? (1 + sqrt(1 + (1.05 / offset) ** 2)) / 2 : 1;
    plot(across * bend, away * 0.13 * bend, (0.2 + (1 - radius / 2.75) * 0.34) * (1 - sin(angle + 1.1) * 0.6) * min(fall * 9, 1), 24 + across * 9);
  }
  for (let index = 0; index < 150; index++) {
    const angle = (index / 150) * TAU;
    plot(cos(angle) * 0.46, sin(angle) * 0.46, 0.3, 42);
  }
};

const planet: Shade = (x, y, time) => {
  const u = x / 1.22;
  const v = y / 1.22;
  const reach = hypot(u, v);
  const light = -u * 0.76 + v * 0.42;
  tint = 262 - light * 62;
  if (reach >= 1) return glow(reach - 1, 0.11) * clamp(light + 0.45) * 0.85;
  const depth = sqrt(1 - reach * reach);
  const across = u * 0.92 + v * 0.38;
  const latitude = v * 0.92 - u * 0.38;
  const longitude = atan2(across, depth) + time * 0.5;
  const bands = sin(latitude * 15 + sin(longitude * 2 + latitude * 6) * 2 + sin(longitude * 5 - time * 0.9 + latitude * 9) * 0.7);
  const sun = clamp((light + depth * 0.5) * 1.8);
  tint += bands * 30;
  return max((0.5 + bands * 0.5) ** 1.3 * sun, (1 - depth) ** 4 * clamp(light + 0.6), clamp(1 - abs(bands) * 5) * depth * 0.42);
};

const fire: Emit = (time, plot) => {
  for (let index = 0; index < 1500; index++) {
    const source = index % 7;
    const side = source - 3;
    const reach = (1.2 + 0.55 * sin(time * (2 + source * 0.4) + source * 1.7)) * (1.5 - abs(side) * 0.3);
    const life = fract(noise(index, 1) + time * (0.7 + noise(index, 2) * 0.5));
    const spread = (noise(index, 3) - 0.5) * 0.95 * (1 - life) ** 0.6;
    const sway = sin(life * 5 - time * 6 + source) * 0.16 * life;
    plot(side * 0.6 + spread + sway, -1.1 + side * side * 0.05 + life * reach, min(life * 5, 1) * (1 - life) ** 1.7 * 0.9, 54 - life * 62);
  }
};

const plasma: Emit = (time, plot) => {
  const flicker = floor(time * 14);
  for (let arc = 0; arc < 10; arc++) {
    let angle = arc * 1.256 + sin(time * 0.3 + arc * 2.4) * 0.5 + time * 0.1;
    let x = 0;
    let y = 0;
    for (let step = 0; step < 52; step++) {
      angle += (noise(arc * 31 + step, 1) - 0.5) * 0.8 + (noise(arc * 31 + step, flicker) - 0.5) * 0.3;
      x += cos(angle) * 0.07;
      y += sin(angle) * 0.052;
      plot(x, y, 1.1 * (1 - step / 66), 262 + step * 1.3 - arc * 5);
    }
  }
  for (let index = 0; index < 90; index++) {
    const angle = index * 2.39996;
    const radius = sqrt(index / 90) * 0.2;
    plot(cos(angle) * radius, sin(angle) * radius, 0.6, 300);
  }
};

const waves: Shade = (x, y, time) => {
  const near = hypot(x + 0.62, y);
  const far = hypot(x - 0.62, y);
  const crest = sin(near * 9 - time * 2.4) + sin(far * 9 - time * 2.4);
  return ((crest + 2) / 4) ** 2.2 * glow(hypot(x * 0.5, y * 0.7), 1.4);
};

const SCENES = {
  suns: swarm(solid(moth)),
  prism,
  warp: swarm(warp),
  orbits: swarm(morph(disc, shell)),
  hole: swarm(hole),
  silk,
  strings: swarm(morph(helix, coil)),
  corona: swarm(corona),
  julia,
  plasma: swarm(plasma),
  slots,
  strands: swarm(strands),
  hypercube: swarm(solid(hypercube)),
  fire: swarm(fire),
  attractor: swarm(attractor),
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
const HOLDS: Partial<Record<SceneName, number>> = { suns: 4.1, orbits: LONG_HOLD_S, strings: LONG_HOLD_S, slots: 4.2 };

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
