import Link from 'next/link';

/**
 * The footer at the bottom of the hero.
 *
 * Three groups, one line, set in the smallest voice on the page so it never
 * competes with the headline above it. The middle group carries the studio line
 * with a rule through it, which is the only place on the page that is purely
 * decorative without being an image.
 *
 * The links are real destinations this project has, not placeholder socials:
 * the repository, the API's own health check, and the source-of-truth README.
 */
export function CinemaFooter({ year = new Date().getFullYear() }: { year?: number }) {
  return (
    <footer className="relative z-10 px-6 pb-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 text-gray-500 sm:flex-row sm:justify-between sm:gap-6">
        <ul className="cine-label flex items-center gap-6 text-[9px]">
          <li>
            <a
              href="https://github.com/ItsPinion/QuizPlatform"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white"
            >
              Github
            </a>
          </li>
          <li>
            <a
              href="https://github.com/ItsPinion/QuizPlatform#readme"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white"
            >
              Docs
            </a>
          </li>
          <li>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white"
            >
              API status
            </a>
          </li>
        </ul>

        <p className="cine-label flex items-center gap-3 text-[9px]">
          <span aria-hidden className="h-px w-8 bg-gray-700" />
          Turborepo · Hono · Drizzle
        </p>

        <p className="cine-label text-[9px]">© {year} QuizPlatform</p>
      </div>

      <p className="cine-label mx-auto mt-5 w-full max-w-6xl text-center text-[9px] text-gray-500 sm:text-left">
        <Link href="/login" className="transition-colors hover:text-white">
          Sign in
        </Link>
      </p>
    </footer>
  );
}
