// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Select } from './select';

/**
 * The bug these exist for: the filter card holds the dropdown, the card carries
 * `backdrop-filter` (so it is its own stacking context), and the quiz grid below
 * painted straight over the open list. `z-50` inside a card never means "above
 * the page".
 *
 * The fix is a portal, and a portal is exactly the sort of thing that is easy to
 * quietly undo. So: open the list and assert it is a child of `<body>`, that it
 * is `position: fixed`, and that it sits above the console's own floating
 * layers. None of that can be true of an absolutely positioned list inside the
 * card.
 *
 * The file is `.ts` on purpose — `createElement` instead of JSX — so the whole
 * workspace keeps one transform. `tsconfig.json` says `"jsx": "preserve"` for
 * Next's benefit, and the test runner has no reason to fight it.
 */

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  // React 19 will not render into a test container without this.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/** `<option>` children, the way every call site writes them. */
function options(...pairs: [string, string][]): ReactNode[] {
  return pairs.map(([value, label]) => createElement('option', { key: value, value }, label));
}

function mount(children: ReactNode, props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() =>
    root!.render(createElement(Select, { ...props, children } as Parameters<typeof Select>[0])),
  );

  return container;
}

/** Give the trigger a size, because jsdom reports every rect as zero. */
function sizeTrigger(trigger: HTMLElement, rect: Partial<DOMRect> = {}) {
  trigger.getBoundingClientRect = () =>
    ({
      top: 200,
      left: 320,
      width: 240,
      height: 40,
      bottom: 240,
      right: 560,
      x: 320,
      y: 200,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
}

function open(trigger: HTMLElement) {
  sizeTrigger(trigger);
  act(() => trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const triggerIn = (host: HTMLElement) => host.querySelector('[role="combobox"]') as HTMLElement;
const listbox = () => document.querySelector('[role="listbox"]') as HTMLElement | null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  document.body.innerHTML = '';
});

describe('Select', () => {
  it('renders the list in a portal on <body>, not inside the field', () => {
    const host = mount(options(['newest', 'Recently added'], ['title', 'Title']), {
      name: 'sort',
      defaultValue: 'newest',
    });

    expect(listbox()).toBeNull();
    open(triggerIn(host));

    const list = listbox()!;

    expect(list).not.toBeNull();
    expect(list.parentElement).toBe(document.body);
    expect(host.contains(list)).toBe(false);
  });

  it('positions the list fixed, above everything the console floats', () => {
    const host = mount(options(['newest', 'Recently added']), {
      name: 'sort',
      defaultValue: 'newest',
    });

    open(triggerIn(host));
    const list = listbox()!;

    expect(list.className).toContain('fixed');
    expect(list.className).toMatch(/z-\[120\]/);
    // Placement comes from the measured field, not from CSS defaults.
    expect(list.style.left).toBe('320px');
    expect(list.style.width).toBe('240px');
    expect(list.style.top).toBe('246px');
  });

  it('keeps the submitted value while the list lives elsewhere', () => {
    const host = mount(options(['newest', 'Recently added'], ['title', 'Title']), {
      name: 'sort',
      defaultValue: 'newest',
    });

    const hidden = host.querySelector('input[name="sort"]') as HTMLInputElement;

    expect(hidden.value).toBe('newest');
    open(triggerIn(host));

    const title = [...document.querySelectorAll('[role="option"]')].find((option) =>
      option.textContent?.includes('Title'),
    ) as HTMLElement;

    act(() => title.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(hidden.value).toBe('title');
    expect(listbox()).toBeNull();
  });

  it('stays open while the click is inside the portal', () => {
    const host = mount(options(['newest', 'Recently added'], ['title', 'Title']), {
      name: 'sort',
      defaultValue: 'newest',
    });

    open(triggerIn(host));

    act(() => {
      listbox()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(listbox()).not.toBeNull();
  });

  it('closes when the click lands outside both the field and the portal', () => {
    const host = mount(options(['newest', 'Recently added']), {
      name: 'sort',
      defaultValue: 'newest',
    });

    open(triggerIn(host));
    expect(listbox()).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(listbox()).toBeNull();
  });

  it('never opens wider than the window, however narrow it is', () => {
    const host = mount(options(['newest', 'Recently added']), {
      name: 'sort',
      defaultValue: 'newest',
    });

    const trigger = triggerIn(host);
    sizeTrigger(trigger, { left: 0, width: 5000 });
    act(() => trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const list = listbox()!;

    expect(Number.parseFloat(list.style.width)).toBeLessThanOrEqual(window.innerWidth - 16);
    expect(Number.parseFloat(list.style.left)).toBeGreaterThanOrEqual(8);
  });
});
