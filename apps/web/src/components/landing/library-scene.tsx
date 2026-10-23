import { cn } from '@/lib/utils';

/**
 * A library, in pixels.
 *
 * Hand-drawn on a 4-unit grid (`viewBox="0 0 200 120"`), one `<rect>` at a time,
 * with `shape-rendering: crispEdges` so it stays sharp at any size instead of
 * going soft like a scaled bitmap. Two shelves of books, a brass lamp that
 * actually throws light, a plant, and a cat asleep on the bottom shelf — the
 * whole page is meant to feel like a reading room, and a reading room needs a
 * cat.
 *
 * The lamp and the tail are the only moving parts, and both are switched off by
 * the reduced-motion block in `globals.css`.
 */

const SHELF_BOOKS = [
  { x: 26, w: 6, h: 20, color: '#c9925e' },
  { x: 33, w: 8, h: 24, color: '#4f8f86' },
  { x: 42, w: 5, h: 18, color: '#b06a72' },
  { x: 48, w: 7, h: 22, color: '#7a6bb0' },
  { x: 56, w: 6, h: 16, color: '#d8c9a8' },
  { x: 63, w: 9, h: 25, color: '#5f7c94' },
  { x: 73, w: 5, h: 19, color: '#7f9a6a' },
  { x: 79, w: 7, h: 23, color: '#c9925e' },
  { x: 87, w: 6, h: 17, color: '#b06a72' },
  { x: 94, w: 8, h: 21, color: '#4f8f86' },
  { x: 103, w: 5, h: 15, color: '#d8c9a8' },
  { x: 109, w: 7, h: 24, color: '#7a6bb0' },
  { x: 117, w: 6, h: 20, color: '#5f7c94' },
  { x: 124, w: 9, h: 18, color: '#7f9a6a' },
  { x: 134, w: 6, h: 22, color: '#c9925e' },
  { x: 141, w: 7, h: 16, color: '#b06a72' },
] as const;

const LEANING_BOOKS = [
  { x: 62, y: 24, w: 6, h: 18, color: '#7a6bb0' },
  { x: 69, y: 26, w: 6, h: 16, color: '#4f8f86' },
  { x: 76, y: 28, w: 5, h: 14, color: '#c9925e' },
] as const;

const FLOOR_STACK = [
  { x: 92, y: 99, w: 30, h: 5, color: '#b06a72' },
  { x: 95, y: 94, w: 26, h: 5, color: '#4f8f86' },
  { x: 98, y: 89, w: 22, h: 5, color: '#c9925e' },
] as const;

export function LibraryScene({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 120"
      className={cn('pixel-art h-auto w-full', className)}
      role="presentation"
    >
      {/* The case. */}
      <rect x="14" y="8" width="172" height="104" rx="4" fill="#151320" />
      <rect x="14" y="8" width="172" height="104" rx="4" fill="none" stroke="#3a3450" />
      <rect x="18" y="12" width="164" height="96" fill="#191627" />

      {/* Back wall: a faint glow coming from the lamp side. */}
      <rect x="18" y="12" width="164" height="96" fill="#1e1a2e" opacity="0.9" />

      {/* ------------------------------ top shelf ------------------------------ */}
      {/* A small framed print: a moon over two hills. */}
      <rect x="24" y="14" width="32" height="20" fill="#0f0d18" />
      <rect x="24" y="14" width="32" height="20" fill="none" stroke="#4a4266" />
      <rect x="44" y="18" width="6" height="6" fill="#e8d9a8" />
      <rect x="28" y="28" width="10" height="4" fill="#3f5b52" />
      <rect x="38" y="26" width="14" height="6" fill="#32463f" />
      <rect x="30" y="20" width="2" height="2" fill="#8d86b0" />
      <rect x="36" y="17" width="2" height="2" fill="#8d86b0" />

      {LEANING_BOOKS.map((book) => (
        <rect
          key={`${book.x}-${book.color}`}
          x={book.x}
          y={book.y}
          width={book.w}
          height={book.h}
          fill={book.color}
        />
      ))}

      {/* A globe, because a library has one even if nobody spins it. */}
      <rect x="104" y="22" width="12" height="12" fill="#3f6f7a" />
      <rect x="106" y="19" width="8" height="3" fill="#4f8f86" />
      <rect x="106" y="24" width="5" height="4" fill="#7f9a6a" />
      <rect x="108" y="30" width="4" height="3" fill="#7f9a6a" />
      <rect x="108" y="34" width="4" height="4" fill="#8a6a3f" />
      <rect x="104" y="38" width="12" height="3" fill="#a8824c" />

      {/* Hanging plant, dropping from the top shelf. */}
      <rect x="158" y="12" width="2" height="6" fill="#6b6580" />
      <rect x="152" y="18" width="14" height="5" fill="#a05f68" />
      <rect x="153" y="23" width="4" height="6" fill="#5f7f52" />
      <rect x="158" y="23" width="4" height="9" fill="#6f8f5e" />
      <rect x="162" y="23" width="3" height="5" fill="#5f7f52" />

      {/* ----------------------------- middle shelf ---------------------------- */}
      <rect x="18" y="42" width="164" height="4" fill="#3a3450" />
      <rect x="18" y="42" width="164" height="1" fill="#55507a" />

      {SHELF_BOOKS.map((book) => (
        <g key={`${book.x}-${book.h}`}>
          <rect x={book.x} y={76 - book.h} width={book.w} height={book.h} fill={book.color} />
          <rect
            x={book.x}
            y={76 - book.h}
            width={book.w}
            height="2"
            fill="#ffffff"
            opacity="0.18"
          />
          <rect
            x={book.x + 1}
            y={76 - book.h + 6}
            width={book.w - 2}
            height="1"
            fill="#000"
            opacity="0.2"
          />
        </g>
      ))}

      {/* ------------------------------- the lamp ------------------------------ */}
      {/* A desk lamp standing on the lower shelf, shade just under the board. */}
      <rect x="156" y="72" width="22" height="4" fill="#8a6a3f" />
      <rect x="166" y="58" width="3" height="15" fill="#a8824c" />
      <polygon points="154,58 182,58 176,46 160,46" fill="#d8b06a" />
      <polygon points="154,58 182,58 176,46 160,46" fill="none" stroke="#8a6a3f" />
      <rect x="164" y="58" width="8" height="2" fill="#e8c98a" />
      {/* The light itself, spilling down the shelf and onto the spines. */}
      <polygon
        points="157,60 179,60 188,76 148,76"
        fill="#f4d79a"
        opacity="0.16"
        style={{ animation: 'lamp-glow 6s ease-in-out infinite' }}
      />
      <rect x="168" y="48" width="2" height="10" fill="#fff3c4" opacity="0.7" />

      {/* ------------------------------ lower shelf ---------------------------- */}
      <rect x="18" y="76" width="164" height="4" fill="#3a3450" />
      <rect x="18" y="76" width="164" height="1" fill="#55507a" />

      {/* A folded newspaper. */}
      <rect x="26" y="92" width="24" height="12" fill="#c9bfa4" />
      <rect x="28" y="94" width="20" height="2" fill="#8d8468" />
      <rect x="28" y="98" width="14" height="1" fill="#8d8468" />
      <rect x="28" y="101" width="18" height="1" fill="#8d8468" />

      {/* A plant in a pot: rim, body, three fronds. */}
      <rect x="58" y="96" width="24" height="4" fill="#a05f68" />
      <rect x="60" y="100" width="20" height="8" fill="#b06a72" />
      <rect x="62" y="100" width="16" height="8" fill="#c07a80" />
      <rect x="68" y="86" width="4" height="10" fill="#5f7f52" />
      <rect x="60" y="90" width="8" height="3" fill="#6f8f5e" />
      <rect x="60" y="86" width="3" height="6" fill="#6f8f5e" />
      <rect x="72" y="88" width="8" height="3" fill="#6f8f5e" />
      <rect x="77" y="83" width="3" height="6" fill="#6f8f5e" />

      {FLOOR_STACK.map((book) => (
        <rect
          key={`${book.x}-${book.y}`}
          x={book.x}
          y={book.y}
          width={book.w}
          height={book.h}
          fill={book.color}
        />
      ))}

      {/* -------------------------------- the cat ------------------------------ */}
      <g>
        {/* Tail, hinged where it meets the floor. */}
        <g
          style={{ transformOrigin: '144px 104px', animation: 'tail-sway 6s ease-in-out infinite' }}
        >
          <rect x="130" y="104" width="14" height="4" fill="#4a4450" />
          <rect x="130" y="98" width="4" height="8" fill="#4a4450" />
          <rect x="134" y="94" width="4" height="6" fill="#4a4450" />
        </g>

        {/* Body and chest. */}
        <rect x="144" y="94" width="26" height="14" fill="#4a4450" />
        <rect x="150" y="98" width="12" height="10" fill="#6d6472" />
        <rect x="144" y="106" width="26" height="2" fill="#38333e" />

        {/* Head, ears, face. */}
        <rect x="152" y="82" width="16" height="14" fill="#4a4450" />
        <rect x="151" y="76" width="5" height="7" fill="#4a4450" />
        <rect x="164" y="76" width="5" height="7" fill="#4a4450" />
        <rect x="152" y="77" width="3" height="4" fill="#6d6472" />
        <rect x="165" y="77" width="3" height="4" fill="#6d6472" />
        <rect x="168" y="86" width="3" height="4" fill="#6d6472" />
        {/* Closed eyes: two sleeping dashes. */}
        <rect x="155" y="88" width="3" height="2" fill="#0f0d18" />
        <rect x="162" y="88" width="3" height="2" fill="#0f0d18" />
        <rect x="159" y="92" width="2" height="2" fill="#b06a72" />
        <rect x="146" y="92" width="4" height="1" fill="#6d6472" />
        <rect x="170" y="92" width="4" height="1" fill="#6d6472" />
      </g>

      {/* Two slow stars in the frame, so the still life has a pulse. */}
      <rect
        x="44"
        y="20"
        width="2"
        height="2"
        fill="#f4e9c8"
        opacity="0.7"
        style={{ animation: 'atmos-twinkle 5s ease-in-out infinite alternate' }}
      />
      <rect
        x="54"
        y="24"
        width="2"
        height="2"
        fill="#f4e9c8"
        opacity="0.4"
        style={{ animation: 'atmos-twinkle 7s ease-in-out infinite alternate-reverse' }}
      />
    </svg>
  );
}
