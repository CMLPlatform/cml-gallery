// The gallery filter's rules and its URL form, free of the DOM so they can be tested.

/** What a card exposes through its data-* attributes. */
export interface CardData {
  search: string; // lower-case name, summary, authors and tags
  department: string;
  type: string;
  tags: string[];
}

export interface Filters {
  q: string;
  dept: string;
  type: string;
  tags: string[];
}

/** Every set filter must match; within tags, any one selected tag is enough. */
export function matches(card: CardData, { q, dept, type, tags }: Filters): boolean {
  const term = q.trim().toLowerCase();
  return (
    (!term || card.search.includes(term)) &&
    (!dept || card.department === dept) &&
    (!type || card.type === type) &&
    (tags.length === 0 || card.tags.some((t) => tags.includes(t)))
  );
}

/** Filters from a query string such as `?q=lca&dept=Industrial+Ecology&type=data&tags=a,b`. */
export function readFilters(search: string): Filters {
  const p = new URLSearchParams(search);
  return {
    q: p.get('q') ?? '',
    dept: p.get('dept') ?? '',
    type: p.get('type') ?? '',
    tags: (p.get('tags') ?? '').split(',').filter(Boolean),
  };
}

/**
 * The query string for a set of filters: empty ones are left out, and '' when nothing is set.
 * Parameters in `keep` that are not filters (a utm tag, say) are carried over.
 */
export function filterQuery({ q, dept, type, tags }: Filters, keep = ''): string {
  const p = new URLSearchParams(keep);
  for (const key of ['q', 'dept', 'type', 'tags']) p.delete(key);
  if (q.trim()) p.set('q', q.trim());
  if (dept) p.set('dept', dept);
  if (type) p.set('type', type);
  if (tags.length) p.set('tags', tags.join(','));
  // Tags hold only a-z, 0-9 and '-', so a literal comma keeps the link readable.
  const query = p.toString().replaceAll('%2C', ',');
  return query ? `?${query}` : '';
}
