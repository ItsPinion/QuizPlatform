/**
 * The rules behind the ambience toggle, without a browser.
 *
 * The component that owns the Web Audio graph is hard to test (jsdom has no
 * `AudioContext`); the decisions it makes are not. Those live here so the three
 * that matter are covered by the suite:
 *
 *   1. Only an explicit `on` arms the automatic starters. A remembered mute is
 *      never overridden, and a first visit is off.
 *   2. The event list is broad, because the music should start at the earliest
 *      legal moment — a pointer move counts on the browsers that honour it, and
 *      a key press or a tap always does.
 *   3. The button's wording says what state the sound is in, including the
 *      in-between state where it is wanted but the browser has not allowed it yet.
 */

/** localStorage key. The value is the preference, and it is the only state kept. */
export const MUSIC_STORAGE_KEY = 'quiz:music';

export type MusicPreference = 'on' | 'muted' | 'unset';

/**
 * Read a stored value.
 *
 * `off` is what older builds wrote and is still honoured as a mute; anything
 * unrecognised is `unset`, which behaves like a first visit (off). A typo in
 * storage can therefore never turn the music on.
 */
export function parseMusicPreference(raw: string | null | undefined): MusicPreference {
  if (raw === 'on') return 'on';
  if (raw === 'muted' || raw === 'off') return 'muted';

  return 'unset';
}

/** What the toggle writes. Only a deliberate choice is ever stored. */
export function serializeMusicPreference(preference: 'on' | 'muted'): string {
  return preference;
}

/**
 * Events that may unlock audio, in the order they tend to arrive.
 *
 * Every one of them is registered with `{ passive: true }` and none of them
 * cancels anything: the ambience must never cost a scroll or a click. The
 * browser still decides — `pointermove` does not grant user activation in
 * Chrome, but it does in some browsers and it costs nothing to try, and a
 * context that is already running simply stays running.
 */
export const AMBIENCE_START_EVENTS = [
  'pointermove',
  'pointerdown',
  'keydown',
  'touchstart',
  'wheel',
  'scroll',
  'click',
] as const;

/** Should the automatic starters be armed? Only when the music is wanted. */
export function shouldArmStarters(preference: MusicPreference): boolean {
  return preference === 'on';
}

/**
 * The button's accessible name: what the sound is doing, not what a click does.
 *
 * `active` is the *intent* (the switch is on), not proof of audio — a browser
 * may not have allowed sound yet, and the tooltip is where that is explained.
 */
export function ambienceToggleLabel(active: boolean): string {
  return active ? 'Turn off library ambience' : 'Play library ambience';
}

/**
 * The tooltip. The middle state is the honest one: the visitor asked for sound,
 * and the browser is waiting for an interaction before it will make any.
 */
export function ambienceTooltip(playing: boolean, preference: MusicPreference): string {
  if (playing) return 'Library ambience: on — click to silence it';

  if (preference === 'on') {
    return 'Library ambience: waiting for a click, a key press or a pointer move to start';
  }

  if (preference === 'muted') return 'Library ambience: muted — your choice is remembered';

  return 'Library ambience: off — click to play it';
}
