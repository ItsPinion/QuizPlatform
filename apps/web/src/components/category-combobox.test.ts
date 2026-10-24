// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CategoryCombobox } from './category-combobox';

/**
 * The combobox sits in the quiz form, inside a `Card`, and a card carries
 * `backdrop-filter` — its own stacking context. The category list had exactly
 * the bug the select had: open it and the card below paints over it. Same fix,
 * same assertion: the list is a child of `<body>` and floats above the console.
 */

const CATEGORIES = [
  { id: '1', name: 'JavaScript', slug: 'javascript', quizCount: 3 },
  { id: '2', name: 'SQL', slug: 'sql', quizCount: 1 },
];

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() =>
    root!.render(
      createElement(CategoryCombobox, {
        id: 'categoryName',
        categories: CATEGORIES as never,
        value: '',
        onChange: () => {},
      }),
    ),
  );

  return container.querySelector('input') as HTMLInputElement;
}

const listbox = () => document.querySelector('[role="listbox"]') as HTMLElement | null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  document.body.innerHTML = '';
});

describe('CategoryCombobox', () => {
  it('opens the category list on <body>, above the card it sits in', () => {
    const input = mount();

    input.getBoundingClientRect = () => ({ top: 100, left: 40, width: 300, height: 36 }) as DOMRect;
    act(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));

    const list = listbox();

    expect(list).not.toBeNull();
    expect(list!.parentElement).toBe(document.body);
    expect(list!.className).toContain('fixed');
    expect(list!.className).toMatch(/z-\[120\]/);
    expect(list!.style.left).toBe('40px');
  });

  it('lists the categories that match, and nothing before it is opened', () => {
    const input = mount();

    expect(listbox()).toBeNull();

    input.getBoundingClientRect = () => ({ top: 100, left: 40, width: 300, height: 36 }) as DOMRect;
    act(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));

    expect(listbox()!.textContent).toContain('JavaScript');
    expect(listbox()!.textContent).toContain('SQL');
  });
});
