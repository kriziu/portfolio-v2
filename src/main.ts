import './style.css';
import { painter } from './color';
import { holdBreath, jackpot, primeJackpot } from './jackpot';
import { CALM, FADE_S, SCENE_COUNT, WIPE_COUNT, blastOf, holdOf, hushOf, type Frame } from './scenes';

const FRAME_MS = 30;
const SPIN_FRAME_MS = 14;
const MAX_STEP_MS = 100;
const INTRO_S = 1.3;
const STILL_S = 6.5;

const mark = document.querySelector<HTMLElement>('#mark')!;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const draw = painter(mark);

let scene = still ? 0 : Math.floor(Math.random() * SCENE_COUNT);

const nextScene = (): number => (scene + 1) % SCENE_COUNT;

if (still) {
  const show = (): void => draw({ from: scene, to: scene, progress: 0, time: STILL_S, wipe: 0, life: holdOf(scene) });
  show();
  mark.addEventListener('click', () => {
    scene = nextScene();
    show();
  });
} else {
  primeJackpot(mark);
  let time = 0;
  let last = performance.now();
  let sceneStart = INTRO_S;
  let fadeStart = INTRO_S + holdOf(scene);
  let turn = 0;
  let origin: Frame['origin'];
  let visible = true;
  let paid = false;

  mark.addEventListener('click', ({ clientX, clientY }) => {
    if (time > INTRO_S && time < fadeStart) {
      const box = mark.getBoundingClientRect();
      const unit = box.height / 2;
      origin = [(clientX - box.left - box.height * 0.965) / unit, (box.top + unit - clientY) / unit];
      fadeStart = time;
    }
  });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible && !paid) holdBreath(CALM);
  }).observe(mark);

  const primeWin = (): void => {
    if (blastOf(scene) !== Infinity) setTimeout(() => primeJackpot(mark));
  };

  const frameMs = (): number => (blastOf(scene) === Infinity ? FRAME_MS : SPIN_FRAME_MS);
  const wipe = (): number => (turn % 2 ? 1 + ((turn >> 1) % (WIPE_COUNT - 1)) : 0);

  const loop = (now: number): void => {
    if (visible && now - last >= frameMs()) {
      time += Math.min(now - last, MAX_STEP_MS) / 1000;
      last = now;
      let age = time - fadeStart;
      if (age >= FADE_S) {
        scene = nextScene();
        sceneStart = time;
        fadeStart = time + holdOf(scene);
        origin = undefined;
        turn++;
        age = 0;
        paid = false;
        primeWin();
      }
      if (!paid && age < 0 && time - sceneStart >= blastOf(scene)) {
        paid = true;
        jackpot(mark);
      }
      if (!paid) holdBreath(hushOf(scene, time - sceneStart, Math.max(age, 0) / FADE_S));
      if (time < INTRO_S) draw({ from: SCENE_COUNT, to: scene, progress: time / INTRO_S, time, wipe: 1 });
      else draw({ from: scene, to: nextScene(), progress: Math.max(age, 0) / FADE_S, time, wipe: wipe(), life: time - sceneStart, origin });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
