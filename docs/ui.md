# UI system — the bento surface

The landing page was built section by section, each milestone adding its own card
row. The result was honest but flat: sixteen sections, eight different card
shapes, no shared interaction language.

This pass introduces one surface — **the bento card** — and applies it across the
front page: the six-cell product map under the hero, the stack, the two access
panels, the three "how it is wired" notes and the fourteen shipped-in cells.

---

## 1. Why a bento grid

The page has to answer two questions in the first screen: _what is this?_ and
_does it work?_ A bento grid does both at once — each cell is a different fact,
the grid reads as a product rather than a list, and the size of a cell is
proportional to how much that fact matters.

| Cell | Width | Content                                                           | Links to      |
| ---- | ----- | ----------------------------------------------------------------- | ------------- |
| 1    | 2/4   | The admin console: 4 users, 10 quizzes, 47 questions — SQL counts | `/admin`      |
| 2    | 1/4   | The clock: 15–30 minutes per quiz, resumed, never re-spent        | `#student`    |
| 3    | 1/4   | Hardening: 51 attack tests over nine areas                        | `#security`   |
| 4    | 1/4   | Grading: +3 right, 0 wrong, 0 blank — one pure grader             | `#submission` |
| 5    | 2/4   | Deployment: `bun run deploy:check` → 8 checks, ready              | `#deployment` |
| 6    | 1/4   | The stack: Next 16, Hono 4 RPC, Drizzle + Turso, Zod              | `#stack`      |

Two wide cells against four narrow ones: enough asymmetry to read as a bento,
not so much that the page becomes a puzzle. Every cell is a link, so the grid is
also the page's table of contents.

---

## 2. The primitives

`apps/web/src/components/ui/bento.tsx` — three exports, all small.

```tsx
<BentoGrid className="lg:auto-rows-[12.5rem] lg:grid-cols-4">
  <BentoCard
    href="/admin"
    tone="primary"
    particles={12}
    magnet
    ripple
    className="p-5 lg:col-span-2"
  >
    …
  </BentoCard>
</BentoGrid>
```

| Prop          | Type                                   | Default   | Meaning                                                |
| ------------- | -------------------------------------- | --------- | ------------------------------------------------------ |
| `tone`        | `primary \| sky \| success \| warning` | `primary` | The glow colour, via the `--bento-glow` variable       |
| `href`        | `string`                               | —         | Renders an `<a>`; without it, a `<div>`                |
| `interactive` | `boolean`                              | `true`    | Tilt on pointer move. Off for text-dense cards         |
| `particles`   | `number`                               | `0`       | Stars spawned on enter, one every 80 ms                |
| `magnet`      | `boolean`                              | `false`   | Lean up to 6 px toward the cursor                      |
| `ripple`      | `boolean`                              | `false`   | A soft disc from the click point (link cards only)     |
| `className`   | `string`                               | —         | Spans, padding, layout — the grid stays the page's job |

`BentoGrid` only supplies the gap; every span lives on the card, because only the
page knows what it is laying out.

`BentoSurface` is the third export: a wrapper for _lists_ of static cells (the
fourteen shipped-in cards). It attaches one delegated `pointermove` listener for
the whole grid instead of turning every cell into a client component, and sets
the same variables on whichever `.bento-card` is under the pointer.

The mechanics live in `apps/web/src/app/globals.css`:

- `--mx` / `--my` — pointer position, set from a `pointermove` handler;
- `--rx` / `--ry` — up to 8° of rotation, derived from the same position;
- `--tx` / `--ty` — up to 6 px of magnetic lean;
- `::before` — the light: a radial gradient in the tone's colour at 20% alpha;
- `::after` — the same gradient masked to a one-pixel frame, so the border lights
  up where the pointer is;
- `.bento-star` — a 4 px disc with a one-shot drift animation;
- both pseudo-elements sit at `z-index: -1` inside `isolation: isolate`, which
  puts them above the card's background and below its content without any z-index
  bookkeeping in the markup.

---

## 3. The rules

1. **Motion is opt-in, twice.** Tilt, magnetism and stars only run for a fine
   pointer (`event.pointerType === 'mouse'`) and never when
   `prefers-reduced-motion: reduce` is set. The CSS mirrors it: `@media (hover:
none)` removes the transform; `@media (prefers-reduced-motion: reduce)`
   removes the transitions and hides the stars and the ripple. The hover border
   still answers in both cases — it is information, not decoration.
2. **Colour comes from tokens.** A card sets `--bento-glow` through a Tailwind
   arbitrary property (`[--bento-glow:var(--primary)]`), so a theme change moves
   the glow with it. Nothing hardcodes `rgb(132, 0, 255)`.
3. **Keyboard first.** Cards are links with a real focus ring (`outline`, offset
   3px) and the glow also appears on `:focus-visible`; the pointer effect is
   never the only affordance.
4. **No runtime dependency.** The reference implementation pulls in GSAP. This
   one is React and CSS: the compositor animates custom properties, React never
   re-renders on pointer move, and there is nothing to keep in sync with a library
   upgrade.
5. **Stars clean up after themselves.** Each star is a `<span>` with a one-shot
   CSS animation; it removes itself on `animationend`, and leaving the card clears
   the pending spawn timers. No looping timeline, nothing accumulating across
   hovers.

---

## 4. Intensity is per card

The reference (`MagicBento`) is a demo component, and a good one. Its full
vocabulary is available here — but not everywhere at once:

| Effect             | Where it runs here                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Spotlight + border | Every bento surface: the six showcase cells, the stack, the access panels, the fourteen shipped-in cells |
| Tilt (8°)          | Every interactive card                                                                                   |
| Magnetism (6 px)   | Showcase, stack and access cards — not the dense lists                                                   |
| Particle stars     | The six showcase cells only, 7–12 per card, one-shot drift                                               |
| Ripple             | Link cards — the cell is a destination, so a press means something                                       |
| GSAP               | Not adopted: two CSS variables and a keyframe replace it, and the dependency is the expensive part       |

The rule of thumb: **the more a card is content, the less it should move.** A
showcase cell can sparkle; a fourteen-item reference list should not, because
motion there competes with reading. `BentoSurface` exists precisely for that
case — the pointer tracking without the theatre.

---

## 5. Adding a card

1. Pick a span on the 4-column grid. Two wide cards per grid is the limit before
   it stops reading as a bento. Decide intensity first: `particles` and `magnet`
   for a showcase cell, the spotlight alone for anything in a list.
2. Write the content as a server component in the page (or its own module, like
   `components/platform-bento.tsx`) — `BentoCard` takes children, so the content
   stays on the server.
3. Put a number in the copy only if it is a fact you can point at. The console
   card says 47 questions because the seed has 47; if the seed changes, the card
   is wrong and that is a bug.
4. Give it a destination. A bento cell that goes nowhere is a poster.

---

## 6. Next

- The admin shell (`/admin`) and the student dashboard are still on the flat card.
  Same primitives, different grid: stat cards become bento cells with a
  spotlight, charts stay static.
- Auth pages (`/login`, `/register`) are the natural place for a single spotlight
  card rather than a grid.
- Once a second screen uses it, `BentoCard` should grow an `asChild` escape hatch
  instead of the `href` shortcut, so it can wrap a `next/link` or a button.
