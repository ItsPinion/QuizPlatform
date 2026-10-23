# UI system — the landing page and the bento surface

The landing page was built section by section, each milestone adding its own card
row: by Day 14 it had sixteen sections, eight card shapes, a file tree and a
day-by-day log. Honest, and completely unfocused — it read like the README with
worse typography.

This pass rebuilds it as a product page, and keeps one surface for the product
itself.

---

## 1. The page

Six blocks, in the order a visitor asks the questions:

| Block    | Answers                       | What is in it                                                               |
| -------- | ----------------------------- | --------------------------------------------------------------------------- |
| Hero     | What is this, can I see it?   | One promise, two buttons, a real question from a real quiz, a **live** pill |
| Numbers  | Is there anything behind it?  | Four counts, rendered from the database                                     |
| Platform | What does it contain?         | The six-cell bento map                                                      |
| Tour     | What does using it feel like? | Three screens in story order: browse it → read a result → run the console   |
| Call     | Can I try it?                 | Demo logins, but only for accounts that exist                               |
| Footer   | Where is the documentation?   | Links to the README and `docs/`, plus the live endpoints                    |

Three rules hold the page together:

1. **The page sells, the docs explain.** The schema, the endpoint table, the
   migration notes and the day-by-day log live in the README and `docs/`. The
   page links to them; it does not reproduce them.
2. **Every figure is a query.** Not one number, name or duration in the landing
   components is typed by hand — see §2.
3. **Every picture is the product.** The hero and the three tour rows are live
   markup built from real rows, not screenshots and not illustration.

---

## 2. One payload, no constants

`GET /api/landing` (public, `no-store`) returns everything the page renders, and
`apps/web/src/app/page.tsx` is a server component that fetches it once per
request, validates it against `landingPayloadSchema`, and passes slices of it
down:

| Field            | Feeds                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| `service`        | the `v0.1.0` badge, the runtime card's version, runtime and uptime         |
| `database`       | the runtime card's target + latency, the hero pill's first render          |
| `counts`         | the four headline numbers, the hero sentence, the console and result cards |
| `shape`          | the attempt-clock range, the question range, the pass-mark range           |
| `categories`     | the console shot's bar chart and its top rows                              |
| `quizzes`        | the catalogue shot, the "N of M published" figure                          |
| `sampleQuestion` | the hero's attempt screen: a real question from the fullest published quiz |
| `sampleResult`   | the floating result card and the grading row                               |
| `demo`           | the printed logins at the close                                            |

Four rules make that safe:

- **No key.** The question projection selects `optionText` and `position` only —
  `isCorrect` is never in the object, so it cannot leak through a later edit. A
  test asserts the response contains no `isCorrect`, `explanation` or
  `selectedOptionId`.
- **No people.** The sample result is an attempt queried _without_ joining
  `users`: marks, counts, a pass flag. No id, name or address leaves the endpoint
  outside the demo block, and a test greps for `@` to prove it.
- **No lying when it breaks.** If the database cannot be read the endpoint still
  answers 200 with zeroes, `database.connected: false` and an
  `unavailableReason`; the page renders its empty states and a thin warning bar.
  A landing page that invents a plausible quiz when the API is down is worse than
  one that says nothing.
- **No advertised dead logins.** The demo block is filtered against the `users`
  table, so a reseeded or renamed database shows the accounts that exist — and
  `DEMO_ACCOUNTS=0` removes the block entirely for a real deployment.

The one thing that is _not_ server-rendered is the hero pill's refresh: it starts
from the server's snapshot, then polls `/api/health/db` once a minute so the
number moves while the page is open. On failure it keeps the last snapshot and
labels itself `stale`.

The page is `force-dynamic` and the fetch is `no-store`: "live" has to mean live.

---

## 3. The primitives

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

## 4. The rules

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

## 5. Intensity is per card

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

## 6. Adding a card

1. Pick a span on the 4-column grid. Two wide cards per grid is the limit before
   it stops reading as a bento. Decide intensity first: `particles` and `magnet`
   for a showcase cell, the spotlight alone for anything in a list.
2. Write the content as a server component in the page (or its own module, like
   `components/platform-bento.tsx`) — `BentoCard` takes children, so the content
   stays on the server.
3. Add anything the card counts to `/api/landing` first, then read it from the
   payload. The console card says 47 questions because the database says 47; a
   literal in a card is a promise the database cannot keep.
4. Give it a destination. A bento cell that goes nowhere is a poster.

---

## 7. Next

- The hero's live pill is the only client-side call on the page; if a second one
  appears, they should share one fetch rather than each polling.
- The login and register pages still print a version they were built with. They
  pass no `version` prop to `SiteHeader`, so it is simply absent — better a blank
  than a stale claim, but a shared shell fetch would fix it properly.
- The admin shell (`/admin`) and the student dashboard are still on the flat card.
  Same primitives, different grid: stat cards become bento cells with a
  spotlight, charts stay static.
- Auth pages (`/login`, `/register`) are the natural place for a single spotlight
  card rather than a grid.
- Once a second screen uses it, `BentoCard` should grow an `asChild` escape hatch
  instead of the `href` shortcut, so it can wrap a `next/link` or a button.
