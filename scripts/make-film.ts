/**
 * Generates the landing page's background film.
 *
 * The page must work with no network at all, so the backdrop is not a stock
 * clip or a CDN stream — it is rendered here, checked into `apps/web/public`,
 * and served from the same origin as the CSS.
 *
 *   bun run scripts/make-film.ts
 *
 * Requires `ffmpeg` on PATH. The output is deliberately small and soft: it is
 * blurred to 20px and crushed under two dark overlays by the time anyone sees
 * it, so detail would be wasted bytes.
 *
 * It draws three layers of the same room:
 *
 *   1. `reading-room.mp4` / `.webm` — two slow lights drifting, a sweep crossing
 *      behind them, grain. Every motion term completes an integer number of
 *      cycles in LOOP seconds, so the last frame flows back into the first and
 *      the loop has no seam.
 *   2. `reading-room.jpg` — the first frame, used as the video's poster.
 *   3. `reading-room.gif` — the dust: two dozen motes on black, drifting on
 *      their own slow paths, looping every GIF_LOOP seconds.
 *
 * The GIF is a **separate layer, not a fallback**: it is composited over
 * whichever base is playing with `mix-blend-mode: screen`, so black reads as
 * transparent and the motes float in front of the film. That solves three
 * problems at once — the background animates even where autoplay or the codec
 * is refused, adding the motes to the video would have cost a re-encode of the
 * whole clip, and there is nothing to see changing when the video takes over.
 *
 * It is also why the GIF is drawn on black with no gradient in it: a GIF has
 * 256 colours for the whole frame, so a smooth gradient bands into visible
 * rings while a scatter of soft dots does not. Sparse content also compresses,
 * which is the only way a GIF becomes small enough to be worth serving.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(import.meta.dir, '..', 'apps', 'web', 'public', 'film');

const FPS = 24;
const LOOP = 12;

/** The GIF loops twice as often: fewer frames, and dust needs less timing. */
const GIF_LOOP = 6;
const GIF_FPS = 8;
const GIF_SIZE = '256:144';
const W = 480; // rendered small, upscaled after blurring
const H = 270;
const SCALE = '1280:720';

const TAU = Math.PI * 2;
const w1 = TAU / LOOP; // one cycle per loop
const w2 = w1 * 2; // two cycles per loop

/** A soft light: a Gaussian pool centred at (cx, cy) with the given spread. */
const pool = (cx: number, cy: number, spread: number) =>
  `exp(-((X-(${cx}))^2+(Y-(${cy}))^2)/${spread})`;

const lum = [
  '34',
  `+72*${pool(`150+70*sin(T*${w1})`, `104+40*cos(T*${w1})`, 2600)}`, // the lamp, near left
  `+42*${pool(`330+55*sin(T*${w2}+1)`, `168+30*cos(T*${w2})`, 5200)}`, // a second lamp, further off
  `+22*exp(-((X-(240+190*sin(T*${w1}+1.6)))^2)/7000)*exp(-((Y-135)^2)/30000)`, // the sweep crossing behind
  `+7*sin(X/42+T*${w2})*cos(Y/34-T*${w1})`, // slow breathing texture
  `+5*sin(X/17-T*${w2})*sin(Y/19+T*${w1})`, // finer grain-ish structure
].join('');

const filter = [
  `geq=lum='${lum}':cb='128':cr='128'`,
  'format=gray',
  'gblur=sigma=4',
  `scale=${SCALE}:flags=bicubic`,
  'eq=contrast=1.06:saturation=0',
  // Film grain at final resolution, so it does not get smeared by the blur.
  'noise=alls=7:allf=t+u',
  'vignette=PI/5.2',
].join(',');

await mkdir(OUT, { recursive: true });

const source = ['-f', 'lavfi', '-i', `nullsrc=s=${W}x${H}:r=${FPS}:d=${LOOP}`, '-vf', filter];

const renders: [string, string[]][] = [
  [
    'reading-room.mp4',
    [
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '31',
      '-preset',
      'slower',
      '-tune',
      'film',
      '-movflags',
      '+faststart',
    ],
  ],
  [
    'reading-room.webm',
    [
      '-c:v',
      'libvpx-vp9',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '40',
      '-b:v',
      '0',
      '-row-mt',
      '1',
      '-deadline',
      'good',
      '-cpu-used',
      '2',
    ],
  ],
];

for (const [name, args] of renders) {
  const result = Bun.spawnSync(['ffmpeg', '-y', ...source, ...args, '-an', join(OUT, name)], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    console.error(new TextDecoder().decode(result.stderr));
    process.exit(1);
  }
}

/**
 * The dust.
 *
 * Two dozen soft dots, each with its own fixed starting point, its own
 * amplitude and its own whole-cycle frequency, so they never fall into step and
 * never drift off the frame. Deterministic on purpose: re-running this script
 * has to produce the same file.
 */
const MOTES = Array.from({ length: 26 }, (_, i) => {
  const px = (i * 37) % 320;
  const py = (i * 53) % 180;
  const r = 2.5 + (i % 5) * 1.6;
  const amp = 8 + (i % 7) * 4;
  const fx = 1 + (i % 3);
  const fy = 1 + (i % 2);
  const phase = i * 0.7;
  const brightness = 26 + (i % 4) * 9;

  const cx = `${px}+${amp}*sin(T*${((TAU * fx) / GIF_LOOP).toFixed(6)}+${phase.toFixed(3)})`;
  const cy = `${py}+${(amp * 0.7).toFixed(1)}*cos(T*${((TAU * fy) / GIF_LOOP).toFixed(6)}+${phase.toFixed(3)})`;

  return `${brightness}*exp(-((X-(${cx}))^2+(Y-(${cy}))^2)/${(2 * r * r).toFixed(1)})`;
}).join('+');

const dust = `12+${MOTES}`;

const gif = Bun.spawnSync(
  [
    'ffmpeg',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `nullsrc=s=320x180:r=${GIF_FPS}:d=${GIF_LOOP}`,
    '-filter_complex',
    [
      // Draw, soften, darken the edges — then quantise to 24 colours with no
      // dithering. Dithering a dark gradient produces a crawling grain that
      // looks like a broken encode; flat dots survive the palette untouched.
      `[0:v]geq=lum='${dust}':cb='128':cr='128',format=gray,gblur=sigma=1.6,vignette=PI/5.2,scale=${GIF_SIZE}:flags=area,split[a][b]`,
      '[a]palettegen=max_colors=24:stats_mode=full[p]',
      '[b][p]paletteuse=dither=none',
    ].join(';'),
    '-loop',
    '0',
    join(OUT, 'reading-room.gif'),
  ],
  { stdout: 'pipe', stderr: 'pipe' },
);

if (gif.exitCode !== 0) {
  console.error(new TextDecoder().decode(gif.stderr));
  process.exit(1);
}

// The poster is the frame the film starts on, so the still and the first frame
// of the video are the same image and the handover is invisible.
const poster = Bun.spawnSync(
  [
    'ffmpeg',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `nullsrc=s=${W}x${H}:r=${FPS}:d=${LOOP}`,
    '-vf',
    `${filter},select=eq(n\\,0)`,
    '-frames:v',
    '1',
    '-q:v',
    '6',
    join(OUT, 'reading-room.jpg'),
  ],
  { stdout: 'pipe', stderr: 'pipe' },
);

if (poster.exitCode !== 0) {
  console.error(new TextDecoder().decode(poster.stderr));
  process.exit(1);
}

for (const file of [
  'reading-room.mp4',
  'reading-room.webm',
  'reading-room.jpg',
  'reading-room.gif',
]) {
  const stat = Bun.file(join(OUT, file));
  console.log(`${file}  ${(stat.size / 1024).toFixed(0)} kB`);
}
