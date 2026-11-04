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
  julia: (_x, _y, time, value) => [292 + value * 120 + time * 14, 88],
  warp: swarmTone,
  silk: (x, y, time) => [280 + x * 28 - y * 34 + time * 18, 82],
  prism: (x, y, time) => [Math.hypot(x, y) * 95 - time * 42, 88],
  attractor: swarmTone,
  aurora: (_x, y) => [128 + Math.max(y + 0.6, 0) * 104, 84],
  strands: swarmTone,
  hypercube: swarmTone,
  corona: swarmTone,
  ribbons: swarmTone,
  empty: swarmTone,
  dust: (x, _y, time) => [x * 40 + time * 24, 62],
  planet: swarmTone,
  hole: swarmTone,
  waves: (x, y, time) => [(Math.hypot(x, y) * 130 - time * 70) % 360, 86],
};

export function painter(mark: HTMLElement): Draw {
  const stage = document.createElement('div');
  const bloom = document.createElement('canvas');
  const ink = document.createElement('canvas');
  const bloomContext = bloom.getContext('2d')!;
  const inkContext = ink.getContext('2d')!;
  const scale = devicePixelRatio;

  bloom.width = COLS;
  bloom.height = ROWS;
  ink.width = Math.ceil(COLS * CELL_WIDTH * scale);
  ink.height = Math.ceil(ROWS * FONT_SIZE * scale);
  inkContext.scale(scale, scale);
  inkContext.font = FONT;
  inkContext.textBaseline = 'top';
  stage.append(bloom, ink);
  mark.append(stage);

  const paint: Draw = (frame) => {
    const { time } = frame;
    inkContext.clearRect(0, 0, ink.width, ink.height);
    bloomContext.clearRect(0, 0, COLS, ROWS);
    eachCell(frame, (col, row, value, name, x, y, tint) => {
      const level = levelOf(value);
      if (level === 0) return;
      const [hue, saturation] = TONES[name](x, y, time, value, tint);
      const lightness = 36 + value * 52;
      const colour = `hsl(${hue} ${saturation}% ${lightness}%)`;
      inkContext.fillStyle = colour;
      inkContext.fillText(RAMP[level], col * CELL_WIDTH, row * FONT_SIZE);
      bloomContext.fillStyle = colour;
      bloomContext.globalAlpha = Math.min(value * 1.3, 1);
      bloomContext.fillRect(col, row, 1, 1);
    });
  };

  return paint;
}
