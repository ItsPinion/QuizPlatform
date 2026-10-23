'use client';

import { Music4, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Library ambience.
 *
 * There is no audio file. A calm reading-room drone is cheap to synthesise and
 * expensive to ship: a 2 MB mp3 is worse than forty lines of Web Audio, cannot
 * be licensed wrong, and can be tuned to the page. What plays is:
 *
 *   - a six-voice pad (A1 · A2 · E3 · A3 · C4 · E4) through a low-pass filter
 *     with a slow filter sweep, so it breathes instead of humming;
 *   - a gentle tremolo on the master gain, about one cycle every twenty seconds;
 *   - occasional soft bells from an A-minor pentatonic scale, two to three
 *     seconds of decay, through a short feedback delay;
 *   - nothing percussive, nothing above ~1.2 kHz. It is background.
 *
 * Rules it follows, because sound on a page is a hostile thing when it is done
 * carelessly:
 *
 *   1. **Off by default**, and never autoplayed. Browsers block it anyway; we
 *      would rather not try.
 *   2. **The preference is remembered**, but resuming still waits for a gesture
 *      (the first click or key press anywhere) because an `AudioContext`
 *      created without one stays suspended.
 *   3. **The toggle is a real button** with `aria-pressed` and a name that says
 *      what state it is in, not what clicking will do.
 *   4. Stopping ramps the gain to zero before closing the context, so there is
 *      no click in the speakers.
 */

const STORAGE_KEY = 'quiz:music';

/** A-minor pentatonic: the notes that cannot sound wrong together. */
const BELL_NOTES = [440, 523.25, 587.33, 659.25, 783.99];

const PAD = [
  { frequency: 55, gain: 0.5, type: 'sine' as OscillatorType, detune: -4 },
  { frequency: 110, gain: 0.34, type: 'sine' as OscillatorType, detune: 3 },
  { frequency: 164.81, gain: 0.2, type: 'triangle' as OscillatorType, detune: -6 },
  { frequency: 220, gain: 0.16, type: 'sine' as OscillatorType, detune: 5 },
  { frequency: 261.63, gain: 0.1, type: 'sine' as OscillatorType, detune: -3 },
  { frequency: 329.63, gain: 0.08, type: 'triangle' as OscillatorType, detune: 7 },
];

interface Engine {
  context: AudioContext;
  master: GainNode;
  stop: () => void;
}

function createEngine(): Engine | null {
  const AudioCtor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

  if (!AudioCtor) return null;

  const context = new AudioCtor();
  const master = context.createGain();
  master.gain.value = 0;

  // A soft low-pass keeps the pad from hissing and makes the bells feel distant.
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 780;
  filter.Q.value = 0.4;

  const delay = context.createDelay(1);
  delay.delayTime.value = 0.42;

  const feedback = context.createGain();
  feedback.gain.value = 0.32;

  const wet = context.createGain();
  wet.gain.value = 0.3;

  filter.connect(master);
  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);
  master.connect(context.destination);

  const voices = PAD.map((voice) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = voice.type;
    oscillator.frequency.value = voice.frequency;
    oscillator.detune.value = voice.detune;
    gain.gain.value = voice.gain;

    oscillator.connect(gain);
    gain.connect(filter);
    oscillator.start();

    return { oscillator, gain };
  });

  // The filter breathes between 620 Hz and 980 Hz over ~26 seconds.
  const sweep = context.createOscillator();
  const sweepDepth = context.createGain();
  sweep.frequency.value = 0.04;
  sweepDepth.gain.value = 180;
  sweep.connect(sweepDepth);
  sweepDepth.connect(filter.frequency);
  sweep.start();

  // The tremolo: one slow cycle on the master, shallow enough to be felt only.
  const tremolo = context.createOscillator();
  const tremoloDepth = context.createGain();
  tremolo.frequency.value = 0.05;
  tremoloDepth.gain.value = 0.012;
  tremolo.connect(tremoloDepth);
  tremoloDepth.connect(master.gain);
  tremolo.start();

  let bellTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const ring = () => {
    if (stopped) return;

    const now = context.currentTime;
    const frequency = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)]!;
    const bell = context.createOscillator();
    const envelope = context.createGain();
    const pan = context.createStereoPanner();

    bell.type = 'sine';
    bell.frequency.value = frequency;
    pan.pan.value = Math.random() * 1.2 - 0.6;
    envelope.gain.setValueAtTime(0, now);

    bell.connect(envelope);
    envelope.connect(pan);
    pan.connect(filter);

    envelope.gain.linearRampToValueAtTime(0.12, now + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
    bell.start(now);
    bell.stop(now + 3.6);

    bellTimer = setTimeout(ring, 7_000 + Math.random() * 9_000);
  };

  bellTimer = setTimeout(ring, 4_000);

  // Fade in over 1.6 s.
  master.gain.setValueAtTime(0, context.currentTime);
  master.gain.linearRampToValueAtTime(0.085, context.currentTime + 1.6);

  return {
    context,
    master,
    stop: () => {
      stopped = true;
      if (bellTimer) clearTimeout(bellTimer);

      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.5);

      setTimeout(() => {
        for (const voice of voices) {
          try {
            voice.oscillator.stop();
          } catch {
            // Already stopped.
          }
        }

        try {
          sweep.stop();
          tremolo.stop();
        } catch {
          // Already stopped.
        }

        void context.close();
      }, 650);
    },
  };
}

export function MusicToggle({ className }: { className?: string }) {
  const engine = useRef<Engine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [wanted, setWanted] = useState(false);

  const start = useCallback(async () => {
    if (engine.current) return;

    const created = createEngine();

    if (!created) return;

    engine.current = created;

    // A context created before a gesture lands suspended; resume it here.
    if (created.context.state === 'suspended') {
      try {
        await created.context.resume();
      } catch {
        // The browser still wants a gesture. The toggle will try again.
      }
    }

    setPlaying(created.context.state === 'running');
  }, []);

  const stop = useCallback(() => {
    engine.current?.stop();
    engine.current = null;
    setPlaying(false);
  }, []);

  // Remember the preference; do not act on it until a gesture makes it legal.
  useEffect(() => {
    let stored = false;

    try {
      stored = window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      stored = false;
    }

    if (!stored) return;

    setWanted(true);

    const resume = () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      void start();
    };

    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });

    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, [start]);

  useEffect(() => {
    return () => {
      engine.current?.stop();
      engine.current = null;
    };
  }, []);

  const toggle = () => {
    if (playing) {
      stop();
      setWanted(false);

      try {
        window.localStorage.setItem(STORAGE_KEY, 'off');
      } catch {
        // Private mode: the preference simply does not persist.
      }

      return;
    }

    setWanted(true);

    try {
      window.localStorage.setItem(STORAGE_KEY, 'on');
    } catch {
      // As above.
    }

    void start();
  };

  const active = playing || wanted;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      aria-label={playing ? 'Turn off library ambience' : 'Play library ambience'}
      title={playing ? 'Library ambience: on' : 'Library ambience: off'}
      className={cn(
        'group border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/40 focus-visible:ring-ring/60 inline-flex h-9 items-center gap-2 rounded-full border bg-transparent px-3 text-[12px] transition-colors outline-none focus-visible:ring-[3px]',
        active && 'border-primary/40 text-primary bg-primary/10',
        className,
      )}
    >
      {playing ? (
        <span className="eq" aria-hidden>
          <span className="eq-bar" />
          <span className="eq-bar" />
          <span className="eq-bar" />
        </span>
      ) : (
        <VolumeX aria-hidden className="size-3.5" />
      )}
      <span className="hidden sm:inline">{playing ? 'Ambience' : 'Music'}</span>
      <Music4 aria-hidden className="size-3.5 sm:hidden" />
    </button>
  );
}
