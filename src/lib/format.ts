// Small shared helpers for presenting project entries.

const DEPT_COLOR: Record<string, string> = {
  'Industrial Ecology': 'var(--dept-ie)',
  'Environmental Biology': 'var(--dept-eb)',
};

export const deptColor = (dept: string) => DEPT_COLOR[dept] ?? 'var(--ink-soft)';

// Okabe-Ito hues used for tags. Colour is deterministic per tag but always
// paired with the tag's text, so it's never the only signal (colourblind-safe).
const TAG_HUES = [
  'var(--ok-blue)',
  'var(--ok-green)',
  'var(--ok-vermillion)',
  'var(--ok-purple)',
  'var(--ok-orange)',
  'var(--ok-sky)',
  'var(--ok-yellow)',
];

export function tagColor(tag: string): string {
  let h = 0;
  // % 2 ** 32 wraps h to unsigned 32-bit each step (same result as `>>> 0`).
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 2 ** 32;
  return TAG_HUES[h % TAG_HUES.length];
}

// Prefix an internal path with the configured base (for GitHub Pages subpaths).
const LEADING_SLASH = /^\//;
const REPEATED_SLASHES = /\/{2,}/g;
export const href = (path: string) =>
  (import.meta.env.BASE_URL + path.replace(LEADING_SLASH, '')).replace(REPEATED_SLASHES, '/');
