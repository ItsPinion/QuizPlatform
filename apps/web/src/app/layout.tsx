import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import './globals.css';

export const metadata: Metadata = {
  title: 'QuizPlatform — Quiz Management & Online Assessment',
  description:
    'A Turborepo monorepo for online quizzes: Next.js web app, Hono RPC API, and Drizzle + Turso database.',
  applicationName: 'QuizPlatform',
};

export const viewport: Viewport = {
  themeColor: '#0d0d14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-background text-foreground min-h-dvh">{children}</body>
    </html>
  );
}
