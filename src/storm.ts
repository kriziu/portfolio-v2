const UNIT_AREA = Math.sqrt(1280 * 800);
const SPARKS_PER_UNIT = 12000;
const MOST_INTERNAL_PIXELS = 3.4e6;
const BLOOM_LEVELS = 5;
const BLOOM_FLOOR = 0.3;
const HERO_WIDE = 2.2;
const HERO_TALL = 1.5;
const TRAIL_KEEP = 0.74;
const SALVOS = [
  [0, 0.5, 1],
  [0.16, 0.25, 0.8],
  [0.4, 0.17, 0.62],
  [0.8, 0.08, 0.48],
];
const SHORTEST_SPARK_S = 0.5;
const LONGEST_SPARK_S = 2.1;
const ARRIVAL_JITTER_S = 0.09;
const LANDING_JITTER_S = 0.12;
const FLOAT_SIZE = 9;
const FLOAT_BYTES = FLOAT_SIZE * 4;
const FURTHEST_LANDING_S = 1.1;
const WARM_TIME_S = -1;

const UPDATE_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 aState;
layout(location=1) in vec2 aHome;
layout(location=2) in vec2 aSpan;
layout(location=3) in vec4 aSeed;
layout(location=4) in float aKind;
uniform float uTime, uStep, uUnit, uPull;
uniform vec2 uOrigin;
out vec4 vState;
const float TAU = 6.2831853;

vec2 flow(vec2 point, float time) {
  vec2 q = point * 0.0046 / uUnit;
  float a = q.x + q.y * 0.6 + time * 0.55;
  float b = -q.x * 1.7 + q.y * 2.1 - time * 0.41;
  float c = q.x * 3.3 + q.y * 2.9 + time * 0.73;
  float d = q.x * 5.1 - q.y * 6.3 - time * 0.97;
  return vec2(
    0.6 * cos(a) + 2.1 * 0.6 * cos(b) + 2.9 * 0.3 * cos(c) - 6.3 * 0.14 * cos(d),
    -cos(a) + 1.7 * 0.6 * cos(b) - 3.3 * 0.3 * cos(c) - 5.1 * 0.14 * cos(d)
  );
}

void main() {
  vec2 point = aState.xy;
  vec2 speed = aState.zw;
  float age = uTime - aSpan.x;
  if (age < 0.0) {
    vState = vec4(aHome, 0.0, 0.0);
    return;
  }
  vec2 away = point - uOrigin;
  float reach = max(length(away), 1.0);
  vec2 outward = away / reach;
  vec2 around = vec2(-outward.y, outward.x);
  bool spark = aKind > 0.5;
  if (age <= uStep) {
    if (spark) {
      float angle = aSeed.x * TAU;
      float burst = mix(240.0, 3300.0, pow(aSeed.y, 2.3)) * aSeed.w * uUnit;
      speed = vec2(cos(angle), sin(angle) * 0.86) * burst;
    } else {
      speed = (outward * mix(500.0, 2600.0, aSeed.y * aSeed.y) + around * (aSeed.z - 0.5) * 1700.0) * uUnit;
    }
  }
  float drag = spark ? mix(1.5, 3.2, aSeed.z) : mix(2.1, 3.4, aSeed.x);
  speed *= exp(-drag * uStep);
  float settle = smoothstep(0.05, 0.6, age);
  speed += flow(point, uTime) * (spark ? 170.0 : 420.0) * settle * uUnit * uStep * 3.0;
  speed += around * (spark ? 90.0 : 420.0) * settle * uUnit * uStep;
  if (spark) {
    speed.y += mix(-90.0, 520.0, aSeed.x) * uUnit * uStep;
  } else {
    float left = aSpan.y - uTime;
    if (left <= 0.0) {
      vState = vec4(aHome, 0.0, 0.0);
      return;
    }
    if (left < uPull) {
      float pull = 1.0 - left / uPull;
      vec2 want = (aHome - point) / max(left, uStep) * (1.0 + pull);
      speed = mix(speed, want, 1.0 - exp(-uStep * (3.0 + 42.0 * pull * pull)));
    }
  }
  vState = vec4(point + speed * uStep, speed);
}`;

const EMPTY_FRAGMENT = `#version 300 es
precision lowp float;
out vec4 color;
void main() { color = vec4(0.0); }`;

const GRAIN_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 aState;
layout(location=1) in vec2 aHome;
layout(location=2) in vec2 aSpan;
layout(location=3) in vec4 aSeed;
layout(location=4) in float aKind;
uniform float uTime, uStep, uScrollY, uScale, uUnit;
uniform vec2 uView, uOrigin;
out vec2 vPixel;
out vec3 vColor;
out float vHalf;
out float vWidth;
out float vDisc;
const float TAU = 6.2831853;

vec3 ramp(float heat) {
  vec3 ember = vec3(0.5, 0.07, 0.015);
  vec3 amber = vec3(1.0, 0.36, 0.035);
  vec3 gold = vec3(1.0, 0.7, 0.19);
  vec3 white = vec3(1.0, 0.95, 0.82);
  if (heat < 0.33) return mix(ember, amber, heat / 0.33);
  if (heat < 0.66) return mix(amber, gold, (heat - 0.33) / 0.33);
  return mix(gold, white, (heat - 0.66) / 0.34);
}

void main() {
  gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
  float age = uTime - aSpan.x;
  float left = aSpan.y - uTime;
  bool spark = aKind > 0.5;
  if (age <= 0.0 || (spark && left <= 0.0) || (!spark && left < -0.55)) return;
  float heat;
  float energy;
  if (spark) {
    float fade = clamp(left / (aSpan.y - aSpan.x), 0.0, 1.0);
    heat = fade * fade;
    energy = (0.5 + 3.4 * heat) * smoothstep(0.0, 0.14, left);
  } else if (left < 0.0) {
    heat = exp(left * 7.0);
    energy = aSeed.w * (0.08 + 1.0 * heat) * smoothstep(-0.55, -0.1, left);
  } else {
    float blast = exp(-age * 3.6);
    float rank = aSeed.x * aSeed.x * aSeed.x * aSeed.x;
    heat = max(max(blast * 0.8, smoothstep(0.55, 0.0, left) * 0.62), mix(0.2, 0.72, rank));
    energy = aSeed.w * (mix(0.07, 1.5, rank) + 0.2 * blast + 0.34 * smoothstep(0.12, 0.0, left));
  }
  float twinkle = pow(max(sin(uTime * (5.0 + aSeed.x * 16.0) + aSeed.y * TAU), 0.0), 30.0);
  vec2 away = aState.xy - uOrigin;
  float beam = 0.5 + 0.5 * cos(atan(away.y, away.x) * 14.0 - uTime * 0.8);
  energy *= mix(0.6, 1.5, beam * beam * beam);
  energy = energy * 0.2 + twinkle * 3.2 * step(0.25, heat + 0.3);
  float speed = length(aState.zw);
  float span = min(speed * uStep * uScale, 150.0 * uScale);
  energy /= 1.0 + span / ((spark ? 34.0 : 16.0) * uScale);
  float width = (spark ? mix(0.7, 1.35, aSeed.z) : mix(0.55, 1.05, aSeed.z)) * uScale * (1.0 + twinkle * 1.4);
  bool disc = !spark && aSeed.z > 0.986 && left > 0.2;
  if (disc) {
    width = mix(5.0, 15.0, aSeed.y) * uScale;
    energy *= 0.05;
    span = 0.0;
  }
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 axis = speed > 1.0 ? aState.zw / speed : vec2(0.0, 1.0);
  vec2 side = vec2(-axis.y, axis.x);
  float margin = width * 2.4;
  float halfSpan = span * 0.5;
  vec2 pixel = vec2(corner.x * margin, corner.y * (halfSpan + margin));
  vec2 center = (aState.xy - vec2(0.0, uScrollY)) * uScale - axis * halfSpan;
  vec2 place = center + side * pixel.x + axis * pixel.y;
  vec2 clip = place / (uView * uScale) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vPixel = pixel;
  vHalf = halfSpan;
  vWidth = width;
  vDisc = disc ? 1.0 : 0.0;
  vColor = ramp(heat) * energy;
}`;

const GRAIN_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vPixel;
in vec3 vColor;
in float vHalf;
in float vWidth;
in float vDisc;
out vec4 color;
void main() {
  float gap = length(vec2(vPixel.x, max(abs(vPixel.y) - vHalf, 0.0))) / vWidth;
  float body = vDisc > 0.5 ? smoothstep(1.05, 0.85, gap) : exp(-gap * gap * 1.4);
  float tail = vHalf > 0.0 ? mix(0.3, 1.0, clamp(vPixel.y / vHalf * 0.5 + 0.5, 0.0, 1.0)) : 1.0;
  color = vec4(vColor * body * tail, 1.0);
}`;

const SCREEN_VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 corner = vec2(gl_VertexID << 1 & 2, gl_VertexID & 2);
  vUv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FADE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform float uKeep;
out vec4 color;
void main() { color = vec4(texture(uSource, vUv).rgb * uKeep, 1.0); }`;

const DOWN_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uFloor;
out vec4 color;
void main() {
  vec3 sum = texture(uSource, vUv).rgb * 4.0;
  sum += texture(uSource, vUv - uTexel).rgb;
  sum += texture(uSource, vUv + uTexel).rgb;
  sum += texture(uSource, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  sum += texture(uSource, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  sum /= 8.0;
  color = vec4(sum * smoothstep(uFloor, uFloor * 2.5, max(sum.r, max(sum.g, sum.b))), 1.0);
}`;

const UP_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
out vec4 color;
void main() {
  vec3 sum = texture(uSource, vUv + vec2(-uTexel.x * 2.0, 0.0)).rgb;
  sum += texture(uSource, vUv + vec2(-uTexel.x, uTexel.y)).rgb * 2.0;
  sum += texture(uSource, vUv + vec2(0.0, uTexel.y * 2.0)).rgb;
  sum += texture(uSource, vUv + vec2(uTexel.x, uTexel.y)).rgb * 2.0;
  sum += texture(uSource, vUv + vec2(uTexel.x * 2.0, 0.0)).rgb;
  sum += texture(uSource, vUv + vec2(uTexel.x, -uTexel.y)).rgb * 2.0;
  sum += texture(uSource, vUv + vec2(0.0, -uTexel.y * 2.0)).rgb;
  sum += texture(uSource, vUv + vec2(-uTexel.x, -uTexel.y)).rgb * 2.0;
  color = vec4(sum / 12.0, 1.0);
}`;

const FINISH_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uGlow;
uniform float uTime, uWaveSpeed, uUnit, uScrollY;
uniform vec2 uView, uOrigin, uHero;
out vec4 color;

float ring(float gap, float radius, float width) {
  float front = gap - radius;
  return exp(-front * front / (width * width)) + (front < 0.0 ? exp(front / (width * 7.0)) * 0.05 : 0.0);
}

void main() {
  vec3 light = texture(uScene, vUv).rgb + texture(uGlow, vUv).rgb * 0.3;
  vec2 point = vec2(vUv.x, 1.0 - vUv.y) * uView + vec2(0.0, uScrollY);
  float gap = distance(point, uOrigin);
  for (int index = 0; index < 3; index++) {
    float start = float(index) * float(index + 1) * 0.08;
    float age = uTime - start;
    if (age <= 0.0) continue;
    float radius = age * uWaveSpeed;
    float fade = exp(-age * 6.0) * (1.0 - float(index) * 0.3) * 0.34;
    float width = (5.0 + age * 42.0) * uUnit;
    light += ring(gap, radius, width) * vec3(1.0, 0.56, 0.16) * fade;
  }
  vec2 offset = (point - uOrigin) / uHero;
  float shelter = smoothstep(0.75, 1.5, length(offset));
  light *= mix(shelter * 0.97 + 0.03, 1.0, exp(-uTime * 8.0));
  float flash = exp(-uTime * 15.0);
  float flare = gap / (230.0 * uUnit);
  light += vec3(1.0, 0.62, 0.24) * flash * 1.3 * exp(-flare * flare);
  light += vec3(1.0, 0.8, 0.5) * flash * 4.0 * exp(-dot(offset, offset) * 0.8);
  light = 1.0 - exp(-light * 1.15);
  light = pow(light, vec3(0.4545, 0.5, 0.6));
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  color = vec4(light + (grain - 0.5) / 255.0, 1.0);
}`;

export interface Stage {
  width: number;
  height: number;
  originX: number;
  originY: number;
  reelGap: number;
  waveSpeed: number;
  reformAt: number;
  reformSpeed: number;
  pullS: number;
}

export interface Storm {
  canvas: HTMLCanvasElement;
  settle(wait?: boolean): boolean;
  draw(time: number, step: number, scrollY: number): void;
  rewind(): void;
  lost(): boolean;
  dispose(): void;
}

interface Target {
  texture: WebGLTexture;
  frame: WebGLFramebuffer;
  width: number;
  height: number;
}

const { floor, hypot, max, min, random, round, sqrt } = Math;

const grainsOf = (ink: Float32Array, stage: Stage, unit: number): Float32Array => {
  const dust = ink.length / 3;
  const sparks = floor(SPARKS_PER_UNIT * min(unit, 1.6));
  const grains = new Float32Array((dust + sparks) * FLOAT_SIZE);
  const { originX, originY, reelGap, waveSpeed, reformAt, reformSpeed, pullS } = stage;
  for (let index = 0; index < dust; index++) {
    const x = ink[index * 3];
    const y = ink[index * 3 + 1];
    const reach = hypot(x - originX, y - originY);
    const birth = reach / waveSpeed + random() * ARRIVAL_JITTER_S;
    const landing = reformAt + pullS + min(reach / reformSpeed, FURTHEST_LANDING_S) + random() * LANDING_JITTER_S;
    grains.set([x, y, birth, landing, random(), random(), random(), ink[index * 3 + 2], 0], index * FLOAT_SIZE);
  }
  let written = dust;
  for (const [start, share, power] of SALVOS) {
    const count = round(sparks * share);
    for (let index = 0; index < count && written < dust + sparks; index++, written++) {
      const x = originX + (floor(random() * 3) - 1) * reelGap + (random() - 0.5) * reelGap * 0.6;
      const y = originY + (random() - 0.5) * reelGap * 0.8;
      const birth = start + random() * ARRIVAL_JITTER_S;
      const life = SHORTEST_SPARK_S + random() ** 2 * (LONGEST_SPARK_S - SHORTEST_SPARK_S);
      grains.set([x, y, birth, birth + life, random(), random(), random(), power, 1], written * FLOAT_SIZE);
    }
  }
  return grains.subarray(0, written * FLOAT_SIZE);
};

export function createStorm(ink: Float32Array, stage: Stage): Storm | undefined {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return undefined;
  const floatTargets = gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float');
  const parallel = gl.getExtension('KHR_parallel_shader_compile');

  const { width, height, originX, originY, reelGap, waveSpeed, pullS } = stage;
  const unit = sqrt(width * height) / UNIT_AREA;
  const scale = min(devicePixelRatio, 2, sqrt(MOST_INTERNAL_PIXELS / (width * height)));
  const fullWidth = round(width * scale);
  const fullHeight = round(height * scale);
  canvas.width = fullWidth;
  canvas.height = fullHeight;

  const shaderOf = (kind: number, source: string): WebGLShader => {
    const shader = gl.createShader(kind)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };

  const programOf = (vertex: string, fragment: string, varying?: string) => {
    const program = gl.createProgram()!;
    gl.attachShader(program, shaderOf(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shaderOf(gl.FRAGMENT_SHADER, fragment));
    if (varying) gl.transformFeedbackVaryings(program, [varying], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    const places = new Map<string, WebGLUniformLocation | null>();
    const seat = (): void => {
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program');
      const seats = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
      for (let index = 0; index < seats; index++) {
        const { name } = gl.getActiveUniform(program, index)!;
        places.set(name, gl.getUniformLocation(program, name));
      }
    };
    const place = (name: string): WebGLUniformLocation | null => places.get(name) ?? null;
    return { program, place, seat };
  };

  const update = programOf(UPDATE_VERTEX, EMPTY_FRAGMENT, 'vState');
  const grain = programOf(GRAIN_VERTEX, GRAIN_FRAGMENT);
  const fade = programOf(SCREEN_VERTEX, FADE_FRAGMENT);
  const down = programOf(SCREEN_VERTEX, DOWN_FRAGMENT);
  const up = programOf(SCREEN_VERTEX, UP_FRAGMENT);
  const finish = programOf(SCREEN_VERTEX, FINISH_FRAGMENT);
  const programs = [update, grain, fade, down, up, finish];

  const grains = grainsOf(ink, stage, unit);
  const count = grains.length / FLOAT_SIZE;
  const states = new Float32Array(count * 4);
  for (let index = 0; index < count; index++) {
    states[index * 4] = grains[index * FLOAT_SIZE];
    states[index * 4 + 1] = grains[index * FLOAT_SIZE + 1];
  }
  const fixed = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fixed);
  gl.bufferData(gl.ARRAY_BUFFER, grains, gl.STATIC_DRAW);
  const moving = [gl.createBuffer(), gl.createBuffer()];

  const shapeOf = (buffer: WebGLBuffer, divisor: number): WebGLVertexArrayObject => {
    const shape = gl.createVertexArray()!;
    gl.bindVertexArray(shape);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, divisor);
    gl.bindBuffer(gl.ARRAY_BUFFER, fixed);
    const layout: [number, number, number][] = [
      [1, 2, 0],
      [2, 2, 8],
      [3, 4, 16],
      [4, 1, 32],
    ];
    for (const [location, size, offset] of layout) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, FLOAT_BYTES, offset);
      gl.vertexAttribDivisor(location, divisor);
    }
    return shape;
  };

  for (const buffer of moving) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, states, gl.DYNAMIC_COPY);
  }
  const stepShapes = moving.map((buffer) => shapeOf(buffer, 0));
  const drawShapes = moving.map((buffer) => shapeOf(buffer, 1));
  const blank = gl.createVertexArray();

  const targetOf = (targetWidth: number, targetHeight: number): Target => {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, floatTargets ? gl.RGBA16F : gl.RGBA8, targetWidth, targetHeight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const frame = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, frame, width: targetWidth, height: targetHeight };
  };

  const trails = [targetOf(fullWidth, fullHeight), targetOf(fullWidth, fullHeight)];
  const glows = Array.from({ length: BLOOM_LEVELS }, (_, level) => targetOf(max(fullWidth >> (level + 1), 1), max(fullHeight >> (level + 1), 1)));
  const feedback = gl.createTransformFeedback();
  let live = 0;

  const aim = (target: Target | null): void => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.frame ?? null);
    gl.viewport(0, 0, target?.width ?? fullWidth, target?.height ?? fullHeight);
  };

  const pass = (source: Target, target: Target, filter: typeof down): void => {
    aim(target);
    gl.useProgram(filter.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform2f(filter.place('uTexel'), 1 / source.width, 1 / source.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const moveGrains = (time: number, step: number): void => {
    const next = 1 - live;
    gl.useProgram(update.program);
    gl.uniform1f(update.place('uTime'), time);
    gl.uniform1f(update.place('uStep'), step);
    gl.uniform1f(update.place('uUnit'), unit);
    gl.uniform1f(update.place('uPull'), pullS);
    gl.uniform2f(update.place('uOrigin'), originX, originY);
    gl.bindVertexArray(stepShapes[live]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, moving[next]);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.endTransformFeedback();
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);
  };

  const fadeTrails = (_time: number, step: number): void => {
    const next = 1 - live;
    gl.bindVertexArray(blank);
    aim(trails[next]);
    gl.useProgram(fade.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trails[live].texture);
    gl.uniform1f(fade.place('uKeep'), TRAIL_KEEP ** (step * 60));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const paintGrains = (time: number, step: number, scrollY: number): void => {
    const next = 1 - live;
    aim(trails[next]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(grain.program);
    gl.uniform1f(grain.place('uTime'), time);
    gl.uniform1f(grain.place('uStep'), step);
    gl.uniform1f(grain.place('uScrollY'), scrollY);
    gl.uniform1f(grain.place('uScale'), scale);
    gl.uniform1f(grain.place('uUnit'), unit);
    gl.uniform2f(grain.place('uView'), width, height);
    gl.uniform2f(grain.place('uOrigin'), originX, originY);
    gl.bindVertexArray(drawShapes[next]);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(blank);
    gl.disable(gl.BLEND);
  };

  const blurGlow = (): void => {
    gl.useProgram(down.program);
    gl.uniform1f(down.place('uFloor'), BLOOM_FLOOR);
    pass(trails[1 - live], glows[0], down);
    gl.uniform1f(down.place('uFloor'), 0);
    for (let level = 1; level < BLOOM_LEVELS; level++) pass(glows[level - 1], glows[level], down);
    gl.enable(gl.BLEND);
    for (let level = BLOOM_LEVELS - 1; level > 0; level--) pass(glows[level], glows[level - 1], up);
    gl.disable(gl.BLEND);
  };

  const present = (time: number, _step: number, scrollY: number): void => {
    const next = 1 - live;
    aim(null);
    gl.useProgram(finish.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, glows[0].texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trails[next].texture);
    gl.uniform1i(finish.place('uScene'), 0);
    gl.uniform1i(finish.place('uGlow'), 1);
    gl.uniform1f(finish.place('uTime'), time);
    gl.uniform1f(finish.place('uWaveSpeed'), waveSpeed);
    gl.uniform1f(finish.place('uUnit'), unit);
    gl.uniform1f(finish.place('uScrollY'), scrollY);
    gl.uniform2f(finish.place('uView'), width, height);
    gl.uniform2f(finish.place('uOrigin'), originX, originY);
    gl.uniform2f(finish.place('uHero'), reelGap * HERO_WIDE, reelGap * HERO_TALL);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    live = next;
  };

  const stages = [moveGrains, fadeTrails, paintGrains, blurGlow, present];

  const draw = (time: number, step: number, scrollY: number): void => {
    for (const stage of stages) stage(time, step, scrollY);
  };

  let seated = false;
  let warmed = 0;

  const settle = (wait = false): boolean => {
    if (warmed === stages.length) return true;
    if (!seated) {
      if (!wait && parallel && !gl.isContextLost() && !programs.every(({ program }) => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR))) return false;
      for (const { seat } of programs) seat();
      seated = true;
    }
    do stages[warmed++](WARM_TIME_S, 0, 0);
    while (wait && warmed < stages.length);
    return warmed === stages.length;
  };

  const rewind = (): void => {
    canvas.remove();
    for (const buffer of moving) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, states);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    for (const { frame } of trails) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };

  const dispose = (): void => {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };

  return { canvas, settle, draw, rewind, dispose, lost: () => gl.isContextLost() };
}
