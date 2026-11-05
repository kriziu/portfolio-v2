import { CALM, type Hush } from './scenes';
import { createStorm, type Stage, type Storm } from './storm';

const INK_SCALE = 2;
const INK_THRESHOLD = 110;
const DUST_PER_SCREEN = 38000;
const FEWEST_DUST = 18000;
const SCREEN_AREA = 1280 * 800;
const REEL_GAP = 0.82;
const WAVE_S = 0.5;
const REFORM_AT_S = 1.25;
const PULL_S = 0.85;
const REFORM_S = 0.9;
const REVEAL_LAG_S = 0.14;
const END_S = 3.9;
const WAVE_SOFT_PX = 46;
const REVEAL_SOFT_PX = 80;
const LONGEST_STEP_S = 0.033;
const SHAKE_S = 0.65;
const SHAKE_PX = 14;
const FAINTEST_COPY = 0.03;
const BEAT_LIGHT = 0.22;
const PULL_SCALE = 0.05;
const PULL_PX = 12;
const TREMBLE_PX = 2.4;
const COPY_BACK_S = 0.6;
const DAWN_AT_S = 1;
const DAWN_S = 1.2;

const { ceil, floor, hypot, max, min, random } = Math;

const spread = (low: number, high: number): number => low + random() * (high - low);

const inkOf = (copy: HTMLElement): Float32Array => {
  const box = copy.getBoundingClientRect();
  const raster = document.createElement('canvas');
  raster.width = ceil(box.width * INK_SCALE);
  raster.height = ceil(box.height * INK_SCALE);
  const context = raster.getContext('2d', { willReadFrequently: true })!;
  context.scale(INK_SCALE, INK_SCALE);
  context.translate(-box.left, -box.top);
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const style = getComputedStyle(node.parentElement!);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.fillStyle = style.color;
    const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = context.measureText('x');
    for (const word of node.data.matchAll(/\S+/g)) {
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      const rect = range.getClientRects()[0];
      if (rect) context.fillText(word[0], rect.left, rect.top + (rect.height - ascent - descent) / 2 + ascent);
    }
  }
  const { data } = context.getImageData(0, 0, raster.width, raster.height);
  let lit = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > INK_THRESHOLD) lit++;
  const wanted = max(DUST_PER_SCREEN * min((innerWidth * innerHeight) / SCREEN_AREA, 1.5), FEWEST_DUST);
  const keep = min(wanted / lit, 1);
  const ink: number[] = [];
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] <= INK_THRESHOLD || random() > keep) continue;
    const cell = (index - 3) / 4;
    ink.push(
      (cell % raster.width) / INK_SCALE + box.left + scrollX,
      floor(cell / raster.width) / INK_SCALE + box.top + scrollY,
      (data[index] / 255) * (data[index - 1] / 255),
    );
  }
  return Float32Array.from(ink);
};

const stageOf = (mark: HTMLElement): Stage => {
  const box = mark.getBoundingClientRect();
  const width = innerWidth;
  const height = innerHeight;
  return {
    width,
    height,
    originX: box.left + scrollX + box.height * 0.965,
    originY: box.top + scrollY + box.height / 2,
    reelGap: box.height * REEL_GAP,
    waveSpeed: hypot(width, height) / WAVE_S,
    reformAt: REFORM_AT_S,
    reformSpeed: height / REFORM_S,
    pullS: PULL_S,
  };
};

let primed: { storm: Storm; stage: Stage; width: number } | undefined;
let held = false;

const dusk = document.createElement('div');
dusk.id = 'dusk';
dusk.setAttribute('aria-hidden', 'true');
document.body.prepend(dusk);

export const holdBreath = ({ dark, pull, tremble, beat }: Hush): void => {
  if (!dark && !held) return;
  held = dark > 0;
  const copy = document.querySelector<HTMLElement>('#copy')!;
  dusk.style.opacity = held ? `${dark}` : '';
  copy.style.opacity = held ? `${1 - dark * (1 - FAINTEST_COPY) + beat * BEAT_LIGHT}` : '';
  copy.style.willChange = held ? 'transform, opacity' : '';
  const shake = tremble * TREMBLE_PX;
  copy.style.transform = held ? `translate(${spread(-shake, shake)}px, ${spread(-shake, shake) - pull * PULL_PX}px) scale(${1 - pull * PULL_SCALE})` : '';
};

export const primeJackpot = (mark: HTMLElement): void => {
  const copy = document.querySelector<HTMLElement>('#copy')!;
  const width = innerWidth;
  if (primed?.width === width && !primed.storm.lost()) return;
  primed?.storm.dispose();
  const stage = stageOf(mark);
  try {
    const storm = createStorm(inkOf(copy), stage);
    primed = storm && { storm, stage, width };
  } catch {
    primed = undefined;
  }
};

export function jackpot(mark: HTMLElement): void {
  const copy = document.querySelector<HTMLElement>('#copy')!;
  copy.style.transform = '';
  primeJackpot(mark);
  if (!primed) return holdBreath(CALM);
  held = false;
  const { storm, stage } = primed;
  primed = undefined;
  const page = mark.parentElement!;
  const box = copy.getBoundingClientRect();
  const centerX = stage.originX - box.left - scrollX;
  const centerY = stage.originY - box.top - scrollY;
  const { canvas } = storm;

  let age = 0;
  let last = performance.now();
  let done = false;

  const veil = (radius: number): void => {
    copy.style.maskImage = `radial-gradient(circle at ${centerX}px ${centerY}px, transparent ${radius}px, #000 ${radius + WAVE_SOFT_PX}px)`;
  };
  const reveal = (radius: number): void => {
    copy.style.maskImage = `radial-gradient(circle at ${centerX}px ${centerY}px, #000 ${radius}px, transparent ${radius + REVEAL_SOFT_PX}px)`;
  };
  const widthChanged = (): void => {
    if (innerWidth !== stage.width) finish();
  };
  const finish = (): void => {
    if (done) return;
    done = true;
    removeEventListener('resize', widthChanged);
    copy.style.maskImage = '';
    copy.style.opacity = '';
    copy.style.willChange = '';
    dusk.style.opacity = '';
    page.style.translate = '';
    storm.dispose();
  };

  canvas.id = 'jackpot';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.addEventListener('webglcontextlost', finish);
  addEventListener('resize', widthChanged);
  document.body.append(canvas);

  const frame = (now: number): void => {
    if (done) return;
    const step = min((now - last) / 1000, LONGEST_STEP_S);
    age += step;
    last = now;
    if (age >= END_S) return finish();
    storm.draw(age, step, scrollY);
    const revealAt = stage.reformAt + stage.pullS + REVEAL_LAG_S;
    if (age < revealAt) veil(age * stage.waveSpeed);
    else reveal((age - revealAt) * stage.reformSpeed);
    const tremor = age < SHAKE_S ? SHAKE_PX * (1 - age / SHAKE_S) ** 2 : 0;
    page.style.translate = tremor ? `${spread(-tremor, tremor)}px ${spread(-tremor, tremor)}px` : '';
    if (age > COPY_BACK_S) copy.style.opacity = '';
    dusk.style.opacity = `${1 - min(max(age - DAWN_AT_S, 0) / DAWN_S, 1)}`;
    requestAnimationFrame(frame);
  };
  frame(last);
}
