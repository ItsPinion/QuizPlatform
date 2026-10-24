import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import localFont from 'next/font/local';

import './globals.css';

/**
 * The two faces the product is set in.
 *
 * Both are self-hosted from `app/fonts` rather than fetched from a CDN: this app
 * has to render identically with no network at all, and a font that arrives late
 * is worse than no font for a page whose whole composition depends on its
 * metrics.
 *
 *   - **Clash Grotesk** — display. Geometric, wide, and it holds up at 9rem
 *     where most grotesques start to look like a default.
 *   - **Plus Jakarta Sans** — body. Modern, low-contrast, legible at 14px, and
 *     its 300 weight is light enough to sit under the display type without
 *     competing with it.
 */
const clashGrotesk = localFont({
  src: './fonts/clash-grotesk-variable.woff2',
  variable: '--font-clash',
  weight: '200 700',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

const jakarta = localFont({
  src: './fonts/plus-jakarta-sans-variable.woff2',
  variable: '--font-jakarta',
  weight: '200 800',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'QuizPlatform — Quiz Management & Online Assessment',
  description:
    'A Turborepo monorepo for online quizzes: Next.js web app, Hono RPC API, and Drizzle + Turso database.',
  applicationName: 'QuizPlatform',
  openGraph: {
    title: 'QuizPlatform — Quiz Management & Online Assessment',
    description:
      'Write the paper, publish it, and let the platform grade it. Quizzes, categories, attempts and results in one typed contract.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${clashGrotesk.variable} ${jakarta.variable} ${GeistMono.variable}`}
    >
      <body className="bg-background text-foreground min-h-dvh">{children}</body>
    </html>
  );
}
