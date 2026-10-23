/**
 * Validate a `?next=` target before redirecting to it.
 *
 * Only same-origin, absolute paths are allowed: anything protocol-relative
 * (`//evil.com`), absolute (`https://evil.com`) or containing control
 * characters or backslashes falls back. Without this, `?next=` is an open
 * redirect an attacker can hand to a victim right after they sign in.
 */
export function safeNextPath(raw: string | string[] | null | undefined, fallback = '/'): string {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  // Whitespace and control characters are never part of a legitimate path.
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return fallback;

  return value;
}
