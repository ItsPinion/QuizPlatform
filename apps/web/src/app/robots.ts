import type { MetadataRoute } from 'next';

/**
 * robots.txt.
 *
 * The public pages are meant to be read by people arriving from a link, so they
 * stay crawlable. The signed-in areas are never useful to a crawler — every one
 * of them redirects to `/login` without a cookie — so keeping them out saves
 * both sides a pointless round trip.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/student', '/student/', '/login', '/register', '/api/'],
      },
    ],
  };
}
