// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MUSIC_STORAGE_KEY } from '@/lib/ambience';

import { MusicToggle } from './music-toggle';

/**
 * The ambience toggle, against a stand-in `AudioContext`.
 *
 * Three behaviours reported from the live app, and one promise the docs make:
 *
 *   1. **A pointer move starts the music**, not only a click — the browser is
 *      what allows or refuses sound, and the component keeps asking on every
 *      plausible interaction until the context is actually running.
 *   2. **A remembered mute is never overridden.** No context is built, nothing
 *      plays, nothing is retried.
 *   3. **A first visit is off**, and pressing the button is what starts it.
 *   4. **Pressing it again mutes and remembers the choice.**
 *
 * The fake context refuses `resume()` until the test says otherwise, which is
 * exactly what a browser without user activation does — and the interesting
 * behaviour is what happens *after* the refusal.
 */

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

function withParams<T extends object>(extra: T): T & FakeNode {
  return Object.assign(new FakeNode(), extra);
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static allowResume = false;

  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  destination = new FakeNode();
  resumeCalls = 0;
  closeCalls = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    return withParams({ gain: new FakeParam() });
  }

  createBiquadFilter() {
    return withParams({ type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() });
  }

  createDelay() {
    return withParams({ delayTime: new FakeParam() });
  }

  createOscillator() {
    return withParams({
      type: 'sine',
      frequency: new FakeParam(),
      detune: new FakeParam(),
      start: vi.fn(),
      stop: vi.fn(),
    });
  }

  createStereoPanner() {
    return withParams({ pan: new FakeParam() });
  }

  async resume() {
    this.resumeCalls += 1;
    if (FakeAudioContext.allowResume) this.state = 'running';
  }

  async close() {
    this.closeCalls += 1;
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioContext.allowResume = false;
  window.localStorage.clear();

  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }

  container.remove();
  window.localStorage.clear();
});

async function mount() {
  root = createRoot(container);

  await act(async () => {
    root?.render(createElement(MusicToggle));
  });
}

function button(): HTMLButtonElement {
  const element = container.querySelector('button');

  if (!element) throw new Error('the toggle did not render a button');

  return element as HTMLButtonElement;
}

/** Let the resume promises settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('MusicToggle', () => {
  it('is off on a first visit and starts on a click', async () => {
    await mount();

    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(button().getAttribute('aria-pressed')).toBe('false');

    FakeAudioContext.allowResume = true;

    await act(async () => {
      button().click();
    });
    await flush();

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]!.state).toBe('running');
    expect(window.localStorage.getItem(MUSIC_STORAGE_KEY)).toBe('on');
    expect(container.querySelector('.eq')).not.toBeNull();
  });

  it('starts on a pointer move when the stored choice is on', async () => {
    window.localStorage.setItem(MUSIC_STORAGE_KEY, 'on');

    await mount();
    await flush();

    // The graph exists and the browser refused — that is the state the visitor
    // used to be stuck in until they clicked.
    expect(FakeAudioContext.instances).toHaveLength(1);

    const context = FakeAudioContext.instances[0]!;

    expect(context.state).toBe('suspended');
    expect(context.resumeCalls).toBeGreaterThan(0);
    expect(container.querySelector('.eq')).toBeNull();

    // Moving the mouse is enough now.
    FakeAudioContext.allowResume = true;

    await act(async () => {
      window.dispatchEvent(new Event('pointermove'));
    });
    await flush();

    expect(context.state).toBe('running');
    expect(container.querySelector('.eq')).not.toBeNull();
  });

  it('also starts on a key press', async () => {
    window.localStorage.setItem(MUSIC_STORAGE_KEY, 'on');

    await mount();
    await flush();

    FakeAudioContext.allowResume = true;

    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
    });
    await flush();

    expect(FakeAudioContext.instances[0]!.state).toBe('running');
  });

  it('never builds an audio graph after a remembered mute', async () => {
    window.localStorage.setItem(MUSIC_STORAGE_KEY, 'muted');
    FakeAudioContext.allowResume = true;

    await mount();
    await flush();

    await act(async () => {
      window.dispatchEvent(new Event('pointermove'));
      window.dispatchEvent(new Event('keydown'));
      window.dispatchEvent(new Event('pointerdown'));
    });
    await flush();

    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(container.querySelector('.eq')).toBeNull();
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().title).toMatch(/remembered/i);
  });

  it('honours the older `off` value as a mute', async () => {
    window.localStorage.setItem(MUSIC_STORAGE_KEY, 'off');
    FakeAudioContext.allowResume = true;

    await mount();
    await flush();

    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('mutes again and remembers it', async () => {
    window.localStorage.setItem(MUSIC_STORAGE_KEY, 'on');
    FakeAudioContext.allowResume = true;

    await mount();
    await flush();

    expect(container.querySelector('.eq')).not.toBeNull();

    await act(async () => {
      button().click();
    });
    await flush();

    expect(window.localStorage.getItem(MUSIC_STORAGE_KEY)).toBe('muted');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.eq')).toBeNull();
  });
});
