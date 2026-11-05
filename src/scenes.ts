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

const SUN_HUES = [272, 46, 18];
const SUN_GAINS = [1.7, 0.95, 1.2];

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
    return [orbit[sample] * wide + cos(angle) * spread, orbit[sample + 1] * tall + sin(angle) * spread, tail * 3.4, SUN_HUES[which], power * SUN_GAINS[which]];
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

const SEVEN_PATH = [
  [196, 108], [246, 110], [309, 126], [334, 130], [381, 127], [402, 119], [408, 113], [432, 131], [351, 275], [342, 295],
  [334, 324], [330, 350], [328, 415], [160, 415], [159, 397], [164, 367], [176, 338], [192, 316], [207, 301], [243, 272],
  [296, 236], [264, 226], [235, 224], [186, 209], [155, 210], [137, 216], [123, 225],
  [107, 244], [100, 260], [71, 260], [71, 120], [120, 122], [154, 116],
];
const SEVEN_CENTER_X = 251.5;
const SEVEN_CENTER_Y = 261.5;
const SEVEN_SCALE = 0.0052;
const SEVEN_RIM = 0.18;
const SEVEN_TOP = 1.02;
const SEVEN_BODY_TOP = 0.72;
const SEVEN_SHOULDER = 0.7;
const SEVEN_LEFT = -1.12;
const SEVEN_RIGHT = 0.98;
const SEVEN_CELLS = 84;
const SEVEN_CELL = 0.03;
const SEVEN_RIM_HUE = 46;
const SEVEN_BODY_PEAK = 0.66;

const buildSevenField = (): Float32Array => {
  const outline = SEVEN_PATH.map(([x, y]) => [(x - SEVEN_CENTER_X) * SEVEN_SCALE, (SEVEN_CENTER_Y - y) * SEVEN_SCALE]);
  const field = new Float32Array(SEVEN_CELLS * SEVEN_CELLS);
  for (let row = 0; row < SEVEN_CELLS; row++) {
    for (let col = 0; col < SEVEN_CELLS; col++) {
      const u = (col + 0.5 - SEVEN_CELLS / 2) * SEVEN_CELL;
      const v = (row + 0.5 - SEVEN_CELLS / 2) * SEVEN_CELL;
      let nearest = Infinity;
      let inside = false;
      for (let index = 0; index < outline.length; index++) {
        const [startX, startY] = outline[index];
        const [endX, endY] = outline[(index + 1) % outline.length];
        const wide = endX - startX;
        const tall = endY - startY;
        const along = clamp(((u - startX) * wide + (v - startY) * tall) / (wide * wide + tall * tall));
        nearest = min(nearest, hypot(u - startX - wide * along, v - startY - tall * along));
        if (startY > v !== endY > v && u < startX + ((v - startY) * wide) / tall) inside = !inside;
      }
      field[row * SEVEN_CELLS + col] = inside ? -nearest : nearest;
    }
  }
  return field;
};

const SEVEN_FIELD = buildSevenField();

const sevenSide = (u: number, v: number): number => {
  const col = floor(u / SEVEN_CELL + SEVEN_CELLS / 2);
  const row = floor(v / SEVEN_CELL + SEVEN_CELLS / 2);
  return col < 0 || row < 0 || col >= SEVEN_CELLS || row >= SEVEN_CELLS ? Infinity : SEVEN_FIELD[row * SEVEN_CELLS + col];
};

const sevenShape = (u: number, v: number): number => {
  if (v > SEVEN_TOP) return Infinity;
  const side = sevenSide(u, v);
  if (v > SEVEN_BODY_TOP && side <= 0) return SEVEN_RIM;
  return side > SEVEN_RIM && v > SEVEN_SHOULDER && u > SEVEN_LEFT && u < SEVEN_RIGHT ? SEVEN_RIM : side;
};

const SYMBOLS: ((u: number, v: number) => number)[] = [
  (u, v) => {
    const side = sevenShape(u, v);
    if (side > SEVEN_RIM) return 0;
    return side > 0 ? 1 : 0.58 + clamp((v + 0.85) / 1.7) * 0.24;
  },
  (u, v) => (hypot(u, v) < 0.78 ? (hypot(u, v) < 0.5 ? 0.5 : 1) : 0),
  (u, v) => clamp((0.86 - abs(u) * 0.9 - abs(v)) * 6) * (u * v > 0 ? 1 : 0.62),
  (u, v) => clamp(-(((u * 1.2) ** 2 + (v * 1.2 + 0.12) ** 2 - 1) ** 3 - (u * 1.2) ** 2 * (v * 1.2 + 0.12) ** 3) * 5),
];
const SYMBOL_HUES = [2, 44, 186, 340];
const STRIP = 32;
const CLEAR_ROWS = 7;
const REEL_STOPS = [0.65, 1.2, 5];
const REEL_BRAKES = [0.42, 0.42];
const REEL_SHAKES = [0.05, 0.05, 0.14];
const REEL_SPEED = 8.5;
const RUSH_SPEED = 24;
const RUSH_CLIMB_S = 0.7;
const TEASE_S = REEL_STOPS[2] - REEL_STOPS[1];
const NUDGE_S = 0.24;
const NUDGE_BACK = 0.7;
const HALT_S = 0.3;
const BRAKE_S = 2;
const BRAKE_CURVE = 1.5;
const BRAKE_RATE = RUSH_SPEED / (exp(BRAKE_CURVE * BRAKE_S) - 1);
const RUN_S = TEASE_S - NUDGE_S - HALT_S;
const CRAWL_S = 1.9;
const CUT_S = 0.74;
const CUT_FADE_S = 0.1;
const HEAT_S = 1.3;
const BEAT_SYNC_S = 1.83;
const FIRST_BEATS = 1;
const PEAK_BEATS = 5.7;
const CHASE_PER_BEAT = 8;
const FLOW_PER_BEAT = 0.85;
const INHALE_S = 0.08;
const WIN_S = REEL_STOPS[2] + INHALE_S;
const IGNITIONS = [-0.16, -0.08, 0];
const IGNITION_PUSH = 0.022;
const OPEN_S = 1.7;
const RUSH_DIM = 0.3;
const STEP_DIM = 0.14;
const DIM_STEPS = 3;
const BLUR_SAMPLES = 6;
const BLUR_STEP = 0.007;
const FOCUS_X = 0.3;
const FIT_WIDTH = 430;
const PAGE_WIDTH_PX = 609;
const HERO_CENTER_PX = 177;
const PX_PER_UNIT = 80;
const SEVEN_REACH = 2.5;
const NARROW_PUSH = 0.4;
const REEL_Y = 0.08;
const BURST_HUES = [46, 192, 276, 330];
const BURST_COUNT = 14;
const COIN_COUNT = 520;
const CHARGE_COUNT = 300;
const SHARD_COUNT = 420;
const REEL_GAP = 1.64;
const SYMBOL_GAP = 1.3;
const SHOCKS = [
  [0, 12, 0.22],
  [0.16, 9, 0.17],
  [0.4, 7, 0.14],
  [0.8, 6, 0.12],
];
const BANNER = [
  '..## .##. .### #..# ###. .##. #####',
  '...# #..# #... #.#. #..# #..# ..#..',
  '...# #..# #... ##.. #..# #..# ..#..',
  '...# #### #... ##.. ###. #..# ..#..',
  '...# #..# #... #.#. #... #..# ..#..',
  '#..# #..# #... #..# #... #..# ..#..',
  '.##. #..# .### #..# #... .##. ..#..',
];
const BANNER_WIDE = 0.12;
const BANNER_TALL = 0.1;
const BANNER_Y = 1.2;

const dealStrip = (): Uint8Array => {
  const strip = new Uint8Array(STRIP);
  for (let cell = 1; cell < STRIP; cell++) {
    const nearPayline = cell < 3 || cell >= STRIP - CLEAR_ROWS;
    do strip[cell] = floor(Math.random() * SYMBOLS.length);
    while (strip[cell] === strip[cell - 1] || (nearPayline && strip[cell] === 0));
  }
  return strip;
};

let strips = REEL_STOPS.map(() => dealStrip());
let spin = 0;
let lastLife = -Infinity;

const rig = {
  zoom: 1,
  focus: 0,
  shiftX: 0,
  shiftY: 0,
  rattle: 0,
  heat: 0,
  beat: 0,
  pulse: 0,
  chase: 0,
  flow: 0,
  crawl: 0,
  cut: 0,
  dark: 0,
  thud: 0,
  tempo: 0,
  targetX: REEL_GAP,
  bases: [0, 0, 0],
  blurs: [0, 0, 0],
};

const rushTravel = (left: number): number => {
  if (left < NUDGE_S) return -NUDGE_BACK * (1 - (1 - left / NUDGE_S) ** 2);
  const run = max(left - NUDGE_S - HALT_S, 0);
  const brake = min(run, BRAKE_S);
  const braked = BRAKE_RATE * ((exp(BRAKE_CURVE * brake) - 1) / BRAKE_CURVE - brake);
  const cruise = RUN_S - RUSH_CLIMB_S;
  const climb = clamp(run - cruise, 0, RUSH_CLIMB_S);
  const climbed = climb * (RUSH_SPEED - ((RUSH_SPEED - REEL_SPEED) * climb) / (2 * RUSH_CLIMB_S));
  return braked - NUDGE_BACK + RUSH_SPEED * (min(run, cruise) - brake) + climbed + REEL_SPEED * max(run - RUN_S, 0);
};

const beatsLeft = (left: number): number => {
  const early = max(left - BEAT_SYNC_S, 0);
  const span = TEASE_S - BEAT_SYNC_S;
  return rushTravel(min(left, BEAT_SYNC_S)) / SYMBOL_GAP + early * (PEAK_BEATS - ((PEAK_BEATS - FIRST_BEATS) * early) / (2 * span));
};

const reelPosition = (reel: number, life: number): number => {
  const left = REEL_STOPS[reel] - life;
  const brake = REEL_BRAKES[reel];
  if (left <= 0) return sin(left * 24) * exp(left * 10) * (reel === 2 ? -0.16 : 0.16);
  if (reel === 2) return rushTravel(left);
  return left < brake ? (REEL_SPEED * left * left) / (2 * brake) : REEL_SPEED * (left - brake / 2);
};

const landingShake = (life: number): number => {
  let offset = 0;
  for (let reel = 0; reel < 3; reel++) {
    const landed = life - REEL_STOPS[reel];
    if (landed > 0) offset += sin(landed * 58) * exp(-landed * 9) * REEL_SHAKES[reel];
  }
  return offset;
};

const strike = (age: number): number => (age > 0 ? exp(-age * 13) : 0);

const brace = (life: number): void => {
  if (life === lastLife) return;
  if (life < lastLife) {
    strips = REEL_STOPS.map(() => dealStrip());
    spin++;
  }
  lastLife = life;
  const left = REEL_STOPS[2] - life;
  const won = life - WIN_S;
  const span = clamp(1 - left / TEASE_S);
  const rise = clamp((life - REEL_STOPS[1]) / HEAT_S);
  const inhale = clamp(-left / INHALE_S);
  const heat = left > 0 ? rise : 0;
  const tick = floor(life * 40);
  for (let reel = 0; reel < 3; reel++) {
    rig.bases[reel] = reelPosition(reel, life);
    rig.blurs[reel] = life < REEL_STOPS[reel] ? abs(reelPosition(reel, life - 0.01) - rig.bases[reel]) * 100 * BLUR_STEP : 0;
  }
  rig.tempo = clamp(rig.blurs[2] / (RUSH_SPEED * BLUR_STEP));
  rig.crawl = clamp(1 - left / CRAWL_S);
  rig.cut = won > 0 ? 0 : clamp((CUT_S - left) / CUT_FADE_S);
  const quiver = heat * heat * rig.tempo * 0.1;
  const blast = won > 0 ? exp(-won * 4.5) * 0.4 : 0;
  const landing = landingShake(life);
  rig.heat = heat;
  rig.pulse = -beatsLeft(max(left, 0));
  rig.beat = heat ? exp(-fract(rig.pulse) * 4.5) * (1 - rig.cut) : 0;
  rig.chase = rig.pulse * CHASE_PER_BEAT;
  rig.flow = rig.pulse * FLOW_PER_BEAT;
  rig.thud = won > 0 ? 0 : IGNITIONS.reduce((sum, at) => sum + strike(-left - at), 0);
  const drop = clamp(rig.pulse + DIM_STEPS, 0, DIM_STEPS);
  const dim = ease(clamp(span * 2)) * RUSH_DIM + (floor(drop) + ease(clamp(fract(drop) * 6))) * STEP_DIM;
  rig.dark = life > REEL_STOPS[1] ? dim + (1 - dim) * rig.cut : 0;
  const push = won > 0 ? 1.03 - cos(won * 15) * exp(-won * 4.2) * 0.13 + sin(won * 7) * 0.006 : 1 + span ** 1.6 * 0.2 + rig.beat * heat * (0.014 + rig.crawl * 0.03) + ease(inhale) * 0.05 + rig.thud * IGNITION_PUSH;
  const fit = min(innerWidth / FIT_WIDTH, 1);
  const lean = fit < 1 ? NARROW_PUSH : 1;
  const room = (max(innerWidth - PAGE_WIDTH_PX, 0) / 2 + HERO_CENTER_PX) / PX_PER_UNIT;
  const framed = fit * (1 + (push - 1) * lean);
  rig.zoom = won > 0 ? framed : min(framed, room / SEVEN_REACH);
  rig.focus = FOCUS_X * lean * (won > 0 ? exp(-won * 14) : ease(span));
  rig.shiftX = (noise(tick, 1) - 0.5) * (quiver + blast) + landing * 0.7;
  rig.shiftY = (noise(tick, 2) - 0.5) * (quiver + blast) + landing;
  rig.rattle = (noise(tick, 3) - 0.5) * heat * heat * rig.tempo * 0.2;
  rig.targetX = rig.focus + (REEL_GAP - rig.focus) * rig.zoom;
};

const streaks = (u: number, angle: number, base: number): number => {
  const lane = floor(u * 5);
  const dash = fract((angle * 1.3 - base) / 3.6 + noise(lane, 1));
  return abs(u) < 1.15 ? glow(dash - 0.5, 0.13) * (0.3 + noise(lane, 2) * 0.8) : 0;
};

const reels = (x: number, y: number, life: number): number => {
  const lift = y - REEL_Y;
  const won = life - WIN_S;
  const reel = floor((x + REEL_GAP * 1.5) / REEL_GAP);
  if (reel < 0 || reel > 2 || abs(lift) >= 1.3) return 0;
  const angle = asin(lift / 1.3);
  const left = REEL_STOPS[reel] - life;
  const settled = life - REEL_STOPS[2];
  const blur = rig.blurs[reel];
  const base = rig.bases[reel];
  const throb = left <= 0 ? rig.beat * rig.heat : 0;
  const pop = won > 0 ? 1 + (1 - exp(-won * 11)) * 0.12 + sin(won * 15) * exp(-won * 3.4) * 0.13 + sin(won * 7) * 0.02 : 1 + throb * (0.07 + rig.crawl * 0.05) + (settled > 0 ? settled * 0.12 : 0);
  const u = (x + (reel === 2 ? rig.rattle : 0) - (reel - 1) * REEL_GAP) / 0.6 / pop;
  const strip = strips[reel];
  const others = settled > 0 ? 0 : (1 - rig.cut) * (left > 0 ? 1 - rig.crawl * 0.7 : 1 - min(rig.heat * 3, 1) * 0.78);
  const rushing = clamp((blur - 0.09) / 0.08);
  const smear = rushing ? streaks(u, angle, base) * rushing : 0;
  let sum = 0;
  let peak = 0;
  let hue = 0;
  let body = false;
  for (let sample = 0; sample < BLUR_SAMPLES; sample++) {
    const place = (angle * 1.3 - base + (sample - (BLUR_SAMPLES - 1) / 2) * blur) / SYMBOL_GAP + 0.5;
    const row = floor(place);
    const symbol = strip[((row % STRIP) + STRIP) % STRIP];
    const v = ((place - row - 0.5) * 2 * 1.08) / pop;
    const value = SYMBOLS[symbol](u, v) * (symbol ? others : 1);
    sum += value;
    if (value > peak) {
      peak = value;
      body = !symbol && sevenShape(u, v) <= 0;
      hue = symbol || body ? SYMBOL_HUES[symbol] : SEVEN_RIM_HUE;
    }
  }
  if (!sum && !smear) return 0;
  const landed = left <= 0 ? exp(left * 7) * 0.7 : 0;
  const lit = settled - IGNITIONS[reel];
  const asleep = reel < 2 && lit <= 0 ? rig.cut * 0.62 : 0;
  const hot = lit > 0 && won <= 0 ? 0.5 + exp(-lit * 11) * 0.9 : left > 0 ? rig.heat * (1 - rushing * 0.45) * 0.45 : 0;
  const sweep = won > 0 ? glow(x + lift * 0.5 + 3.8 - fract(won * 0.8) * 7.6, 0.2) * 0.8 : 0;
  const shine = won > 0 ? 0.95 + sin(won * 9 - abs(x)) * 0.07 : 0.84 + throb * 0.5;
  const solid = (sum / BLUR_SAMPLES) * (1 - rushing * 0.25);
  tint = smear > solid ? 46 - rig.heat * 26 : hue + (won > 0 ? sin(won * 6 + x * 1.4) * 8 : 0);
  const light = (solid + smear) * cos(angle) ** (left > 0 ? 1.4 + rig.crawl * 3.4 : 1.4) * (shine + landed + sweep + hot) * (1 - asleep);
  return body ? min(light, SEVEN_BODY_PEAK + sweep) : light;
};

const rays = (x: number, y: number, life: number): number => {
  const lift = y - REEL_Y;
  const won = life - WIN_S;
  const reach = hypot(x, lift);
  const angle = atan2(lift, x);
  const turn = (1 - exp(-won * 1.5)) * 7 + won * 0.9;
  const front = clamp(sin(angle * 10 + turn) * 3.4 - 1);
  const back = clamp(sin(angle * 6 - turn * 0.7 + 1) * 3 - 1.6);
  const clear = 0.08 + 0.92 * ease(clamp((hypot(x / 2.4, lift / 1.02) - 0.68) * 3.4));
  const fade = clear * glow(reach, 4.4) * min(won * 5, 1);
  const flash = exp(-won * 10) * glow(reach, 4.2) * 1.8;
  const plate = 1 - clamp((0.5 - abs(y - BANNER_Y)) * 6) * clamp((2.4 - abs(x)) * 4) * min(won * 2, 1) * 0.82;
  const beam = max(front * 0.92, back * 0.6) * fade * plate;
  let shock = 0;
  for (const [start, speed, width] of SHOCKS) {
    const age = won - start;
    if (age > 0) shock = max(shock, glow(reach - age * speed, width * (1 + age)) * exp(-age * 1.7));
  }
  tint = front * 0.86 > back * 0.5 ? 42 - reach * 9 : 318 + reach * 10;
  return beam + shock * 1.25 + flash;
};

const tease = (x: number, y: number): number => {
  const { heat, beat, pulse, chase, crawl, cut } = rig;
  if (!heat) return 0;
  const across = x - REEL_GAP;
  const lift = y - REEL_Y;
  const box = max(abs(across) - 0.74, abs(lift) - 1.12);
  const lights = 0.5 + 0.5 * sin((x + y * 1.4) * 8 - chase);
  const hit = beat * (1 + crawl * 1.8);
  const rim = glow(box, 0.07 + heat * 0.07 + hit * 0.04) * (0.4 + lights * 0.6) * min(heat * 6, 1) * (0.85 + hit * 0.6);
  const wash = clamp(-box * 4) * heat * heat * (0.05 + hit * 0.1);
  const closing = fract(pulse);
  const wave = glow(hypot(across, lift * 1.15) - (0.95 + (1 - closing) ** 2 * 3.2), 0.1 + heat * 0.06) * closing * heat * 0.72 * (1 + crawl * 0.5);
  tint = 46 - heat * 30 + (wave > rim ? 330 : 0);
  return (rim + wash + wave) * (1 - cut);
};

const banner = (x: number, y: number, won: number): number => {
  const size = 1 + exp(-won * 13) * 2.4;
  const col = floor(x / (BANNER_WIDE * size) + BANNER[0].length / 2);
  const row = floor((BANNER_Y - y) / (BANNER_TALL * size) + BANNER.length / 2);
  if (BANNER[row]?.[col] !== '#') return 0;
  tint = 46 + sin(won * 5 + x * 1.2) * 14;
  return 1.05 + sin(won * 11 - x * 2) * 0.12;
};

const payout: Emit = (time, plot, life) => {
  const won = life - WIN_S;
  const { heat } = rig;
  for (let reel = 0; reel < 3; reel++) {
    const landed = life - REEL_STOPS[reel];
    if (landed <= 0 || landed > 0.5 || reel === 2) continue;
    for (let index = 0; index < 34; index++) {
      const seed = index + reel * 40 + spin * 131;
      const angle = noise(seed, 3) * TAU;
      const reach = 0.5 + (noise(seed, 4) * 1.2 + 0.2) * (1 - (1 - landed * 2) ** 3);
      plot((reel - 1) * REEL_GAP + cos(angle) * reach, REEL_Y + sin(angle) * reach * 0.8 - landed * landed * 1.4, (1 - landed * 2) * 1.5, 46);
    }
  }
  if (heat && rig.cut < 1) {
    for (let index = 0; index < CHARGE_COUNT; index++) {
      const seed = index + spin * 131;
      const age = fract(rig.flow * (0.7 + noise(seed, 6) * 0.6) + noise(seed, 7));
      const reach = (1 - age) ** 1.5 * 4 + 0.5;
      const angle = noise(seed, 8) * TAU + age * 1.5;
      if (abs(reach * cos(angle)) > 0.72 || abs(reach * sin(angle)) > 0.8) plot(rig.targetX + cos(angle) * reach, REEL_Y + sin(angle) * reach * 0.72, (0.25 + age) * heat * 1.9 * (1 - rig.cut), 46 - heat * 26 - age * 12);
    }
  }
  if (won <= 0) return;
  if (won < 0.7) {
    for (let index = 0; index < SHARD_COUNT; index++) {
      const seed = index + spin * 77;
      const angle = noise(seed, 3) * TAU;
      const speed = 3 + noise(seed, 4) * 11;
      const fly = (1 - exp(-won * 5)) / 5;
      const hue = index % 4 ? 44 : 330;
      for (let trail = 0; trail < 3; trail++) {
        const reach = 0.3 + speed * max(fly - trail * 0.012, 0) * 2.4;
        plot(cos(angle) * reach, REEL_Y + sin(angle) * reach * 0.8, (1 - won / 0.7) * (1.7 - trail * 0.4), hue);
      }
    }
  }
  for (let index = 0; index < COIN_COUNT; index++) {
    const seed = index + spin * 131;
    const flight = (won - (index % 4) * 0.3 - noise(seed, 2) * 0.24) * (0.7 + noise(seed, 1) * 0.5);
    if (flight < 0) continue;
    const age = fract(flight);
    const angle = noise(seed, 3) * TAU;
    const speed = 2 + noise(seed, 4) * 3.6;
    const x = cos(angle) * (0.5 + speed * age);
    const y = REEL_Y + sin(angle) * (0.5 + speed * age) * 0.74 - age * age * 1.9;
    const flip = abs(cos(time * 13 + index)) * 0.09;
    const weight = 1.5 * (1 - age * 0.55);
    if (index % 3) {
      plot(x - flip, y, weight, 38);
      plot(x + flip, y, weight, 46);
    } else {
      plot(x, y, weight * 1.5 * abs(sin(time * 19 + index * 1.7)), 30 + noise(seed, 5) * 18);
    }
  }
  for (let burst = 0; burst < BURST_COUNT; burst++) {
    const start = burst * 0.27 + 0.1 + noise(burst, spin + 7) * 0.14;
    const age = (won - start) / 0.95;
    if (age <= 0 || age >= 1) continue;
    const centerX = (noise(burst, spin + 1) - 0.5) * 6;
    const centerY = 0.1 + (noise(burst, spin + 2) - 0.5) * 2.6;
    const hue = BURST_HUES[floor(noise(burst, spin + 3) * BURST_HUES.length)];
    const open = 1 - (1 - age) ** 3;
    const size = 0.9 + noise(burst, spin + 4) * 0.9;
    for (let spark = 0; spark < 110; spark++) {
      const angle = spark * 2.39996;
      const reach = (0.5 + noise(spark, burst) * 0.75) * size * open;
      plot(centerX + cos(angle) * reach, centerY + sin(angle) * reach * 0.82 - age * age * 0.55, (1 - age) ** 1.3 * 1.6, hue + (spark % 5) * 6);
    }
  }
};

const coins = swarm(payout);

const slots: Shade = (x, y, time, life) => {
  brace(life);
  const won = life - WIN_S;
  const sceneX = rig.focus + (x - rig.focus) / rig.zoom + rig.shiftX;
  const sceneY = REEL_Y + (y - REEL_Y) / rig.zoom + rig.shiftY;
  const symbol = reels(sceneX, sceneY, life);
  if (symbol > 0.3) return symbol;
  const symbolHue = tint;
  const title = won > 0 ? banner(sceneX, sceneY, won) : 0;
  if (title) return title;
  const spark = coins(x + rig.shiftX, y + rig.shiftY, time, life);
  const sparkHue = tint;
  const backdrop = won > 0 ? rays(sceneX, sceneY, life) : tease(sceneX, sceneY);
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
    tint = band > limb ? 176 + ring * 9 : 214;
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
const HOLDS: Partial<Record<SceneName, number>> = { suns: 4.1, orbits: LONG_HOLD_S, strings: LONG_HOLD_S, slots: WIN_S + 4.3 };

export const holdOf = (scene: number): number => HOLDS[NAMES[scene]] ?? HOLD_S;

export const blastOf = (scene: number): number => (NAMES[scene] === 'slots' ? WIN_S : Infinity);

export type Hush = { dark: number; pull: number; tremble: number; beat: number };

export const CALM: Hush = { dark: 0, pull: 0, tremble: 0, beat: 0 };

export const hushOf = (scene: number, life: number, fade: number): Hush => {
  if (NAMES[scene] !== 'slots' || life <= REEL_STOPS[1]) return CALM;
  brace(life);
  const { dark, crawl, heat, tempo, beat, thud } = rig;
  const calm = 1 - fade;
  return { dark: dark * calm, pull: crawl * crawl * calm, tremble: heat * heat * tempo * calm, beat: (beat * crawl + thud) * calm };
};

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

const edge = (x: number, y: number, time: number, open = 0): number => {
  const angle = atan2(y - 0.1, x);
  const reach = hypot(x / 3.25, (y - 0.1) / 1.6) / (1 + open);
  const wobble = 0.05 + 0.03 * sin(angle * 3 + time * 0.7) + 0.02 * sin(angle * 5 - time * 0.5);
  const sides = open ? clamp((3.3 - abs(x)) * (1.6 + rig.cut * 8)) * clamp((1.72 - abs(y)) * 5) : 1;
  return clamp((1 - reach - wobble) * 2.8) * sides;
};

const openOf = (life: number): number => {
  const won = life - WIN_S;
  return won > 0 ? 0.5 + exp(-won * 1.2) * 0.3 : ease(clamp((life - REEL_STOPS[1]) / OPEN_S)) * 0.5 + rig.cut * 0.5;
};

const MOTES = 56;

const eachMote = (time: number, light: number, visit: Visit): void => {
  for (let index = 0; index < MOTES; index++) {
    const x = (fract(noise(index, 1) + time * 0.012 * (noise(index, 2) - 0.5)) - 0.5) * 6.4;
    const y = (fract(noise(index, 3) + time * 0.03 * (0.4 + noise(index, 4))) - 0.5) * 3.2;
    const twinkle = 0.5 + 0.5 * sin(time * (1 + noise(index, 5) * 2) + index);
    visit(x / CELL + COLS / 2, ROWS / 2 - y / STEP, 0.34 * twinkle * light * edge(x, y, time), 'dust', x, y, 0);
  }
};

export function eachCell(frame: Frame, visit: Visit): void {
  const { from, to, progress, time, wipe, life = 0, origin } = frame;
  const arrival = (progress - 1) * FADE_S;
  const order: Wipe = origin ? (x, y, grain) => (hypot(x - origin[0], y - origin[1]) / (3.7 + hypot(...origin))) * 0.86 + grain * 0.14 : WIPES[wipe];
  const first = NAMES[from];
  const second = NAMES[to];
  const open = first === 'slots' ? openOf(life) * (1 - progress) : 0;
  eachMote(time, first === 'slots' ? 1 - rig.cut : 1, visit);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = (col + 0.5 - COLS / 2) * CELL;
      const y = (ROWS / 2 - row - 0.5) * STEP;
      const fade = edge(x, y, time, open);
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
