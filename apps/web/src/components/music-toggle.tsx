'use client';

import { Music4, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AMBIENCE_START_EVENTS,
  ambienceToggleLabel,
  ambienceTooltip,
  MUSIC_STORAGE_KEY,
  parseMusicPreference,
  serializeMusicPreference,
  shouldArmStarters,
  type MusicPreference,
} from '@/lib/ambience';
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
 *   1. **Off by default**, and never autoplayed on a first visit. A browser
 *      would block it anyway; we would rather not try.
 *   2. **A remembered choice is the whole answer.** Muted once means muted until
 *      the visitor says otherwise: no starters are armed, nothing plays, and the
 *      tooltip says the choice was remembered.
 *   3. **When it *is* wanted, it starts at the earliest legal moment.** The graph
 *      is built immediately (suspended, silent) so the first permitted resume is
 *      instant, and every plausible interaction is listened for — a pointer
 *      move, a key press, a tap, a wheel, a click — not just a click, and all of
 *      them passive so nothing is ever blocked. The attempt is repeated on each
 *      one until the context is actually running.
 *   4. **The toggle is a real button** with `aria-pressed` and a name that says
 *      what state it is in, not what clicking will do.
 *   5. Stopping ramps the gain to zero before closing the context, so there is
 *      no click in the speakers.
 */

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
  const [preference, setPreference] = useState<MusicPreference>('unset');
  const [playing, setPlaying] = useState(false);

  /** Resume whatever graph exists; report whether it is actually running. */
  const ensureRunning = useCallback(async (): Promise<boolean> => {
    const current = engine.current;

    if (!current) return false;

    if (current.context.state !== 'running') {
      try {
        // Inside an interaction handler this is the call that matters; outside
        // one the browser simply refuses, and a later attempt tries again.
        await current.context.resume();
      } catch {
        return false;
      }
    }

    const running = engine.current?.context.state === 'running';
    setPlaying(Boolean(running));

    return Boolean(running);
  }, []);

  /**
   * Build the graph if it does not exist, then resume it.
   *
   * Building early is the latency trick: a suspended context is silent, and
   * creating the oscillators now means the first permitted resume is a single
   * call rather than a graph construction.
   */
  const start = useCallback(async (): Promise<boolean> => {
    if (!engine.current) {
      const created = createEngine();

      if (!created) return false;

      engine.current = created;
    }

    return ensureRunning();
  }, [ensureRunning]);

  const stop = useCallback(() => {
    engine.current?.stop();
    engine.current = null;
    setPlaying(false);
  }, []);

  // Read the remembered choice once. Until it is read the toggle is off, so a
  // stored `on` cannot start anything before the component has decided to.
  useEffect(() => {
    let stored: MusicPreference = 'unset';

    try {
      stored = parseMusicPreference(window.localStorage.getItem(MUSIC_STORAGE_KEY));
    } catch {
      // Private mode: no preference, which means off.
      stored = 'unset';
    }

    setPreference(stored);
  }, []);

  /**
   * Music is wanted: start it as early as the browser allows.
   *
   * The graph is created immediately and resumed immediately — that succeeds
   * outright when the visitor has already interacted with the page, or when the
   * browser is lenient. If it does not, every plausible interaction is listened
   * for, so a pointer move, a key press, a tap, a wheel or a click all count,
   * not only a click. The listeners come off the moment the context is running.
   */
  useEffect(() => {
    if (!shouldArmStarters(preference)) return;

    let running = false;
    let detached = false;

    const detach = () => {
      if (detached) return;

      detached = true;

      for (const type of AMBIENCE_START_EVENTS) {
        window.removeEventListener(type, attempt);
      }
    };

    const settle = () => {
      running = true;
      setPlaying(true);
      detach();
    };

    function attempt() {
      if (running) return;

      void ensureRunning().then((ok) => {
        if (ok) settle();
      });
    }

    for (const type of AMBIENCE_START_EVENTS) {
      window.addEventListener(type, attempt, { passive: true });
    }

    void start().then((ok) => {
      if (ok) settle();
    });

    return () => {
      detached = true;

      for (const type of AMBIENCE_START_EVENTS) {
        window.removeEventListener(type, attempt);
      }
    };
  }, [preference, ensureRunning, start]);

  // Leaving the page stops the sound; coming back starts from the preference.
  useEffect(() => {
    return () => {
      engine.current?.stop();
      engine.current = null;
    };
  }, []);

  const persist = (next: 'on' | 'muted') => {
    try {
      window.localStorage.setItem(MUSIC_STORAGE_KEY, serializeMusicPreference(next));
    } catch {
      // Private mode: the choice simply does not survive the tab.
    }
  };

  const toggle = () => {
    if (preference === 'on') {
      stop();
      setPreference('muted');
      persist('muted');

      return;
    }

    setPreference('on');
    persist('on');
    // Inside the click, so this resume is the one the browser is most likely to
    // grant; the effect above retries on any later interaction.
    void start();
  };

  const active = preference === 'on';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label={ambienceToggleLabel(active)}
      title={ambienceTooltip(playing, preference)}
      className={cn(
        'group inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-transparent px-4 text-[10px] tracking-[0.2em] text-gray-300 uppercase transition-colors outline-none hover:border-white/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50',
        active && 'border-white/60 bg-white/8 text-white',
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
      <span className="hidden sm:inline">{active ? 'Ambience' : 'Music'}</span>
      <Music4 aria-hidden className="size-3.5 sm:hidden" />
    </button>
  );
}
