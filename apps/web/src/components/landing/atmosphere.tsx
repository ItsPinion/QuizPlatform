import { cn } from '@/lib/utils';

/**
 * Ambient layer.
 *
 * Six stacked, decorative layers behind a section:
 *
 *   1. a grid that pans upward, slowly, masked to fade at the edges;
 *   2. three blurred aurora blobs drifting on different clocks;
 *   3. a warm lamp glow in the top-right corner, breathing;
 *   4. two star fields twinkling out of phase;
 *   5. rising dust motes, each with its own delay and drift;
 *   6. nothing that the user has to interact with.
 *
 * Every layer animates `transform` or `opacity` only, so the whole thing stays
 * on the compositor. `aria-hidden` throughout: for a screen reader this
 * component does not exist.
 */

const MOTES = [
  { left: '6%', size: 3, duration: 26, delay: 0, drift: 18 },
  { left: '12%', size: 2, duration: 31, delay: 4, drift: -12 },
  { left: '19%', size: 4, duration: 23, delay: 9, drift: 24 },
  { left: '26%', size: 2, duration: 34, delay: 2, drift: -20 },
  { left: '33%', size: 3, duration: 28, delay: 13, drift: 10 },
  { left: '41%', size: 2, duration: 37, delay: 6, drift: -16 },
  { left: '48%', size: 4, duration: 25, delay: 16, drift: 22 },
  { left: '55%', size: 2, duration: 33, delay: 1, drift: -8 },
  { left: '63%', size: 3, duration: 29, delay: 11, drift: 16 },
  { left: '70%', size: 2, duration: 36, delay: 7, drift: -22 },
  { left: '78%', size: 4, duration: 24, delay: 18, drift: 12 },
  { left: '85%', size: 2, duration: 32, delay: 3, drift: -14 },
  { left: '91%', size: 3, duration: 27, delay: 12, drift: 20 },
  { left: '96%', size: 2, duration: 35, delay: 5, drift: -18 },
] as const;

export function Atmosphere({
  className,
  stars = true,
  grid = true,
  motes = true,
}: {
  className?: string;
  stars?: boolean;
  grid?: boolean;
  motes?: boolean;
}) {
  return (
    <div aria-hidden className={cn('atmos', className)}>
      {grid ? <div className="atmos-grid" /> : null}

      <div className="atmos-blob atmos-blob-a" />
      <div className="atmos-blob atmos-blob-b" />
      <div className="atmos-blob atmos-blob-c" />
      <div className="atmos-lamp" />

      {stars ? (
        <>
          <div className="atmos-stars" />
          <div className="atmos-stars-far" />
        </>
      ) : null}

      {motes
        ? MOTES.map((mote, index) => (
            <span
              key={index}
              className="atmos-mote"
              style={
                {
                  left: mote.left,
                  '--mote-size': `${mote.size}px`,
                  '--mote-duration': `${mote.duration}s`,
                  '--mote-delay': `${mote.delay}s`,
                  '--mote-drift': `${mote.drift}px`,
                } as React.CSSProperties
              }
            />
          ))
        : null}
    </div>
  );
}
