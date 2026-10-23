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

| Block    | Answers                       | What is in it                                                                                                        |
| -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Hero     | What is this, can I see it?   | One promise, two session-aware buttons, a real question from a real quiz, a **live** pill and the pixel reading room |
| Numbers  | Is there anything behind it?  | Four counts, rendered from the database                                                                              |
| Platform | What does it contain?         | The six-cell bento map                                                                                               |
| Tour     | What does using it feel like? | Three screens in story order: browse it → read a result → run the console                                            |
| Call     | Can I try it?                 | Demo logins, but only for accounts that exist                                                                        |
| Footer   | Where is the documentation?   | Links to the README and `docs/`, plus the live endpoints                                                             |

Four rules hold the page together:

1. **The page sells, the docs explain.** The schema, the endpoint table, the
   migration notes and the day-by-day log live in the README and `docs/`. The
   page links to them; it does not reproduce them.
2. **Every figure is a query.** Not one number, name or duration in the landing
   components is typed by hand — see §2.
3. **Every picture is the product.** The hero and the three tour rows are live
   markup built from real rows, not screenshots and not illustration.
4. **The buttons know who is looking.** `lib/hero-params.ts` decides both of
   them: a visitor gets **Get started** → `/register`; a student gets **Take a
   quiz** → `/student/quizzes`; an administrator gets **Open the console** →
   `/admin`. The closing section switches the same way (`CtaBand`), so a
   signed-in person is never asked to sign in again.

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

## 7. The reading room

The page is meant to feel like a library at night: warm lamp light, dust in the
air, a shelf of books, a cat asleep on the lower one. None of it is an image
file and none of it blocks anything.

### The mark

`components/brand/logo.tsx` — an open book with a check etched into the right
page, on a soft square plate, drawn on a 32-unit grid. It replaced a letter `Q`
in a rounded box, which is what a logo looks like before anyone designs one.
`LogoMark` takes a `glow` prop (the header pulses, the footer does not) and a
`title` (only when it needs an accessible name — in the header the link already
carries "QuizPlatform — home", so the mark itself is `aria-hidden`).

### The ambient layer

`components/landing/atmosphere.tsx` stacks six decorative layers behind a
section: a masked grid that pans upward, three blurred aurora blobs on 28 s / 34 s
/ 40 s clocks, a warm lamp glow breathing in the corner, two star fields
twinkling out of phase, and fourteen dust motes that rise on their own delays.

Three constraints kept it honest:

1. **Every animation is `transform` or `opacity`.** No gradient is re-composited
   per frame, no `filter` is animated, and the whole thing sits inside
   `contain: strict` so it cannot force a layout of the page.
2. **The whole layer is `aria-hidden`.** It contributes nothing to a screen
   reader and nothing to the tab order.
3. **`prefers-reduced-motion` switches all of it off** — four of the six layers
   are also `display: none` rather than merely frozen, because a static dust mote
   is just a dot.

Where the ideas came from: the aurora is Aceternity's `Aurora Background` and
the star field from 21st.dev's `AuroraBackground`; the panning masked grid is
Magic UI's `AnimatedGridPattern`; the `glow-frame` border beam is Magic UI's
`BorderBeam`, rebuilt with a registered `@property --beam-angle` so a conic
gradient can rotate without JavaScript or the `motion` dependency.

### The pixel art

`components/landing/library-scene.tsx` is a hand-placed SVG on a
`viewBox="0 0 200 120"` grid, one `<rect>` at a time: two shelves of books, a
framed moon print, a globe, a hanging plant, a brass desk lamp, a stack of
books, a potted plant, a folded newspaper and a sleeping cat.

- `shape-rendering: crispEdges` (the `.pixel-art` class) keeps it sharp instead
  of smearing like a scaled bitmap.
- Only two things move: the lamp's cone of light (`lamp-glow`) and the cat's
  tail (`tail-sway`), both switched off by the reduced-motion block.
- It is decoration, so it is `aria-hidden` and does not appear in the
  accessibility tree.

### Sound

`components/music-toggle.tsx` — the header's **Music** button. There is no audio
file; the reading-room drone is synthesised with Web Audio:

| Layer    | What it is                                                                             |
| -------- | -------------------------------------------------------------------------------------- |
| Pad      | six detuned voices (A1 · A2 · E3 · A3 · C4 · E4) through a low-pass filter             |
| Movement | the filter sweeps 620 → 980 Hz over ~26 s; a tremolo runs at 0.05 Hz                   |
| Bells    | occasional sines from A-minor pentatonic, 3.4 s decay, through a 0.42 s feedback delay |

It is **off by default and never autoplays**. The choice is remembered in
`localStorage`, but resuming still waits for a pointer or key gesture, because a
context created without one stays suspended. The button is a real
`<button aria-pressed>` named "Play/Turn off library ambience", and stopping
ramps the gain down over half a second before the context closes so there is no
click in the speakers.

### Glow, everywhere

`.glow-frame` wraps the two auth cards and the closing call-to-action: a conic
beam circling the border. `.shine` is a light that sweeps across a button on
hover. `.text-glow` / `.text-glow-soft` put a halo behind the hero headline and
every section title. `.float-slow` lifts the slowest decorative pieces. The
bento cards keep their own pointer-following light from §3.

---

## 8. The auth screens

`/login` and `/register` are the only two pages every visitor has to get through,
so they are the largest type and the biggest targets in the app. Both share
`components/auth/auth-shell.tsx`:

```
┌──────────────────────────────────────────────────────────────┐
│ header                                                       │
├───────────────────────────┬──────────────────────────────────┤
│ story column (desktop)    │ the form card                    │
│ h2 4xl · live stats       │ h1 2.6rem                        │
│ three promises            │ 56px fields, 56px button         │
│ live pill                 │ demo accounts, or the links      │
└───────────────────────────┴──────────────────────────────────┘
```

**The form comes first.** It is first in the DOM and first on a phone; the story
column (`order-2 lg:order-1`) is the argument for signing in, not the reason you
are on the page. Its numbers — papers graded, categories, quizzes open — are
`sections` of `/api/landing`, so the panel cannot advertise a catalogue the
database does not have. No API, no stat row: it hides rather than printing zero.

### The controls

`components/auth/auth-fields.tsx` is the whole inventory:

| Element                                | Why it is that element                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `<label for>` above the field          | Visible at all times. A placeholder is not a label — it disappears exactly when you need it.       |
| `<input>` 56px tall, 16px text         | 16px stops iOS zooming the page on focus; 56px is a comfortable thumb target.                      |
| `autoComplete` on every field          | `email`, `current-password`, `new-password`, `name` — password managers fill this without a fight. |
| `<button aria-pressed>` for the reveal | 44×44, labelled "Show password" / "Hide password", not a 14px eye you have to hit.                 |
| Caps Lock notice                       | Read from `getModifierState`, attached with `aria-describedby`.                                    |
| `aria-invalid` + `aria-describedby`    | Set only when something is wrong, and the message is the description.                              |

### What a failure does

1. The message goes into a `role="alert"` region — announced, not just coloured red.
2. Focus moves to the field that caused it (the password, for a rejected sign-in).
3. The field itself is marked `aria-invalid`, so a screen reader says "invalid"
   while the message stays attached.

Validation runs on submit, so the button is never a disabled mystery. The
register form shows the three password rules as you type, with a `role="progressbar"`
strength bar and a spoken "met / not met yet" for each rule.

### Demo accounts

The list comes from `/api/landing`'s `demo.accounts` — the seeded accounts that
exist in _this_ database — never from a constant in the page. Each is a button
that fills the form and moves focus to **Sign in**; it deliberately does not
submit for you. `DEMO_ACCOUNTS=0` and the section does not render.

After signing in, the destination is `?next=` when the URL asked for one, and
otherwise the role's home (`/admin` for an administrator, `/student` for a
student). Registration lands in `/student/quizzes`, because an empty dashboard is
not what you signed up for.

---

## 9. Next

- The admin shell (`/admin`) and the student dashboard are still on the flat card.
  Same primitives, different grid: stat cards become bento cells with a
  spotlight, charts stay static.
- The sign-in form is the app's first `<form>` with this much behaviour; the quiz
  runner and the authoring forms still use the 40px shadcn defaults. Promoting
  the 56px field into `components/ui` would make the whole app match.
- Once a second screen uses it, `BentoCard` should grow an `asChild` escape hatch
  instead of the `href` shortcut, so it can wrap a `next/link` or a button.
