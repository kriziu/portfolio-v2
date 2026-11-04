import { COLS, ROWS, RAMP, eachCell, levelOf, type Draw, type SceneName } from './scenes';

const FONT_SIZE = 8;
const FONT = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
const CELL_WIDTH = (38.6 / 64) * FONT_SIZE;

type Tone = (x: number, y: number, time: number, value: number, tint: number) => [hue: number, saturation: number];

const swarmTone: Tone = (_x, _y, _time, _value, tint) => [tint, 90];

const TONES: Record<SceneName, Tone> = {
  suns: swarmTone,
  slots: swarmTone,
  orbits: swarmTone,
  strings: swarmTone,
  plasma: swarmTone,
  fire: swarmTone,
  warp: swarmTone,
  prism: (x, y, time) => [Math.hypot(x, y) * 95 - time * 42, 88],
  aurora: swarmTone,
  strands: swarmTone,
  hypercube: swarmTone,
  corona: swarmTone,
  ribbons: swarmTone,
  empty: swarmTone,
  dust: (x, _y, time) => [x * 40 + time * 24, 62],
  planet: swarmTone,
  hole: swarmTone,
  waves: swarmTone,
};

export function painter(mark: HTMLElement): Draw {
  const stage = document.createElement('div');
  const halo = document.createElement('canvas');
  const bloom = document.createElement('canvas');
  const ink = document.createElement('canvas');
  const haloContext = halo.getContext('2d')!;
  const bloomContext = bloom.getContext('2d')!;
  const inkContext = ink.getContext('2d')!;
  const scale = devicePixelRatio;

  halo.width = bloom.width = COLS;
  halo.height = bloom.height = ROWS;
  ink.width = Math.ceil(COLS * CELL_WIDTH * scale);
  ink.height = Math.ceil(ROWS * FONT_SIZE * scale);
  inkContext.scale(scale, scale);
  inkContext.font = FONT;
  inkContext.textBaseline = 'top';
  stage.append(halo, bloom, ink);
  mark.append(stage);

  const paint: Draw = (frame) => {
    const { time } = frame;
    inkContext.clearRect(0, 0, ink.width, ink.height);
    bloomContext.clearRect(0, 0, COLS, ROWS);
    eachCell(frame, (col, row, value, name, x, y, tint) => {
      const level = levelOf(value);
      if (level === 0) return;
      const [hue, saturation] = TONES[name](x, y, time, value, tint);
      const lightness = 27 + value * 43 + Math.max(value - 0.8, 0) * 90;
      const colour = `hsl(${hue} ${saturation}% ${lightness}%)`;
      inkContext.fillStyle = colour;
      inkContext.fillText(RAMP[level], col * CELL_WIDTH, row * FONT_SIZE);
      bloomContext.fillStyle = colour;
      bloomContext.globalAlpha = Math.min(value * value * 1.5 + value * 0.2, 1);
      bloomContext.fillRect(col, row, 1, 1);
    });
    haloContext.clearRect(0, 0, COLS, ROWS);
    haloContext.drawImage(bloom, 0, 0);
  };

  return paint;
}
