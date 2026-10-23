# UI system — the bento surface

The landing page was built section by section, each milestone adding its own card
row. The result was honest but flat: sixteen sections, eight different card
shapes, no shared interaction language.

This pass introduces one surface — **the bento card** — and uses it as the
page's overview: a six-cell grid that maps the product, and the three
"how it is wired" notes under the verification section. More screens will adopt
it as they are reworked.

---

## 1. Why a bento grid

The page has to answer two questions in the first screen: _what is this?_ and
_does it work?_ A bento grid does both at once — each cell is a different fact,
the grid reads as a product rather than a list, and the size of a cell is
proportional to how much that fact matters.

The six cells, in order:

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

`apps/web/src/components/ui/bento.tsx` — two exports, both small.

```tsx
<BentoGrid className="lg:auto-rows-[12.5rem] lg:grid-cols-4">
  <BentoCard href="/admin" tone="primary" ripple className="p-5 lg:col-span-2">
    …
  </BentoCard>
</BentoGrid>
```

| Prop          | Type                                   | Default   | Meaning                                                |
| ------------- | -------------------------------------- | --------- | ------------------------------------------------------ |
| `tone`        | `primary \| sky \| success \| warning` | `primary` | The glow colour, via the `--bento-glow` variable       |
| `href`        | `string`                               | —         | Renders an `<a>`; without it, a `<div>`                |
| `interactive` | `boolean`                              | `true`    | Tilt on pointer move. Off for text-dense cards         |
| `ripple`      | `boolean`                              | `false`   | A soft disc from the click point (link cards only)     |
| `className`   | `string`                               | —         | Spans, padding, layout — the grid stays the page's job |

`BentoGrid` only supplies the gap; every span lives on the card, because only the
page knows what it is laying out.

The mechanics live in `apps/web/src/app/globals.css`:

- `--mx` / `--my` — pointer position, set from a `pointermove` handler;
- `--rx` / `--ry` — a maximum of 3.2°, derived from the same position;
- `::before` — the light: a radial gradient in the tone's colour, 20% alpha;
- `::after` — the same gradient masked to a one-pixel frame, so the border lights
  up where the pointer is;
- both pseudo-elements sit at `z-index: -1` inside `isolation: isolate`, which
  puts them above the card's background and below its content without any
  z-index bookkeeping in the markup.

---

## 3. The four rules

1. **Motion is opt-in, twice.** The tilt only runs for a fine pointer
   (`event.pointerType === 'mouse'`) and never when
   `prefers-reduced-motion: reduce` is set. The CSS mirrors that: `@media
(hover: none)` removes the transform, `@media (prefers-reduced-motion:
reduce)` removes the transitions. The hover border still answers in both
   cases — it is information, not decoration.
2. **Colour comes from tokens.** A card sets `--bento-glow` through a Tailwind
   arbitrary property (`[--bento-glow:var(--primary)]`), so a theme change moves
   the glow with it. Nothing hardcodes `rgb(132, 0, 255)`.
3. **Keyboard first.** Cards are links with a real focus ring
   (`outline`, offset 3px) and the glow also appears on `:focus-visible`; the
   pointer effect is never the only affordance.
4. **No runtime dependency.** The reference implementation pulls in GSAP. This
   one is ~120 lines of React and CSS: the browser compositor animates custom
   properties, React never re-renders on pointer move, and there is nothing to
   keep in sync with a library upgrade.

---

## 4. What was deliberately not adopted

The reference (`MagicBento`) is a demo component, and a good one. Three of its
effects do not survive contact with a product screen:

| Effect               | Why not                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Particle stars       | One timed particle spawn per hover, DOM nodes appended and removed per enter/leave, and the particles overlap the text they are supposed to decorate |
| Magnetism            | Translates the card toward the pointer, so the link moves as you try to click it — fine on art, hostile on navigation                                |
| Ripple on every card | Feedback should mean "this did something". It is kept for link cards, where a press is real                                                          |
| GSAP                 | Not needed for two CSS variables; the dependency costs more than the thirty lines it replaces                                                        |

What was kept is the part that carries information: the light follows attention,
the border confirms which card is live, and a few degrees of tilt give the grid
depth.

---

## 5. Adding a card

1. Pick a span on the 4-column grid. Two wide cards per grid is the limit before
   it stops reading as a bento.
2. Write the content as a server component in the page (or its own module, like
   `components/platform-bento.tsx`) — `BentoCard` takes children, so the content
   stays on the server.
3. Put the number in the copy only if it is a fact you can point at. The console
   card says 47 questions because the seed has 47; if the seed changes, the card
   is wrong and that is a bug.
4. Give it a destination. A bento cell that goes nowhere is a poster.

---

## 6. Next

- The admin shell (`/admin`) and the student dashboard are still on the flat
  card. Same primitives, different grid: stat cards become bento cells with a
  spotlight, charts stay static.
- Auth pages (`/login`, `/register`) are the natural place for a single
  spotlight card rather than a grid.
- Once a second screen uses it, `BentoCard` should grow a `asChild` escape hatch
  instead of the `href` shortcut, so it can wrap a `next/link` or a button.
