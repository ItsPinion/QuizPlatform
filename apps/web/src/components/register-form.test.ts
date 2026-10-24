// @vitest-environment jsdom

import type { AuthUser } from '@quiz/shared/auth';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The reported bug, end to end in a DOM: "sometimes the dashboard button
 * doesn't show up, it still shows to sign up. after sign up it should
 * automatically transform."
 *
 * This mounts the two things the real page mounts — a header seeded by the
 * server as a guest and the registration form — then fills the form and submits
 * it. The header must read "My dashboard" immediately after the API says the
 * account exists, without waiting for a navigation or a second session read.
 */

const NEW_USER: AuthUser = {
  id: 'new-student',
  name: 'Ada Lovelace',
  email: 'ada@quiz.dev',
  role: 'STUDENT',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const replace = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  client: {
    api: {
      auth: {
        register: {
          $post: async () => ({
            ok: true,
            json: async () => ({ user: NEW_USER, expiresAt: '2026-12-31T00:00:00.000Z' }),
          }),
        },
        me: { $get: async () => ({ ok: false, json: async () => ({}) }) },
        logout: { $post: async () => ({ ok: true }) },
      },
    },
  },
}));

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }

  container?.remove();
  replace.mockClear();
  refresh.mockClear();
  vi.resetModules();
});

/** React listens for `input`; assigning through the prototype setter is how a
 *  controlled field is filled from a test. */
async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);

  if (!input) throw new Error(`no input #${id}`);

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('registering flips the header', () => {
  it('shows the dashboard control as soon as the account exists', async () => {
    const { RegisterForm } = await import('./register-form');
    const { useSession } = await import('@/lib/use-session');

    function HeaderProbe() {
      const session = useSession(null);

      return createElement(
        'span',
        { id: 'header' },
        session.status === 'authenticated' ? 'My dashboard' : 'Get started',
      );
    }

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement('div', null, createElement(HeaderProbe), createElement(RegisterForm)),
      );
    });

    // The visitor arrives as a guest: the server's seed and the snapshot agree.
    expect(container.querySelector('#header')?.textContent).toBe('Get started');

    await fill('name', 'Ada Lovelace');
    await fill('email', 'ada@quiz.dev');
    await fill('password', 'Password123');
    await fill('confirm-password', 'Password123');

    const form = container.querySelector('form');

    if (!form) throw new Error('the form did not render');

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('#header')?.textContent).toBe('My dashboard');
    expect(replace).toHaveBeenCalledWith('/student/quizzes');
    expect(refresh).toHaveBeenCalled();
  });
});
