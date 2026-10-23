'use client';

/**
 * The last-resort boundary.
 *
 * `error.tsx` catches failures inside a route, but a crash in the root layout
 * itself bypasses every layout and stylesheet — Next then renders its own white
 * page, which on a dark product looks like a dead site. This file replaces
 * `<html>` and `<body>`, so nothing from `globals.css` can be relied on: every
 * style here is inline, and the palette is written out by hand.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#0d0d14',
          color: '#ede9f7',
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <main style={{ maxWidth: '30rem', textAlign: 'center' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.6875rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#a78bfa',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            QuizPlatform
          </p>
          <h1
            style={{
              margin: '0.75rem 0 0',
              fontSize: '1.6rem',
              lineHeight: 1.15,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            The app did not load.
          </h1>
          <p
            style={{
              margin: '0.9rem 0 0',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              color: '#b3adc9',
            }}
          >
            Nothing you did caused this, and nothing you submitted was lost. Reloading usually
            clears it.
          </p>

          {error.digest ? (
            <p
              style={{
                margin: '1rem 0 0',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #2b2740',
                background: '#14131f',
                color: '#8f89a8',
                fontSize: '0.6875rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {error.digest}
            </p>
          ) : null}

          <div
            style={{
              marginTop: '1.5rem',
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: '2.75rem',
                padding: '0 1.25rem',
                borderRadius: '0.75rem',
                border: 'none',
                background: '#8b5cf6',
                color: '#fff',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                minHeight: '2.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 1.25rem',
                borderRadius: '0.75rem',
                border: '1px solid #2b2740',
                color: '#ede9f7',
                fontSize: '0.9375rem',
                textDecoration: 'none',
              }}
            >
              Back to the start
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
