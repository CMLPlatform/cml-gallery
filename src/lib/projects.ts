import { type CollectionEntry, getCollection } from 'astro:content';

/** Every entry without `draft: true`, featured first, then by name. */
export async function publishedProjects(): Promise<CollectionEntry<'projects'>[]> {
  return (await getCollection('projects', ({ data }) => !data.draft)).sort((a, b) => {
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    return a.data.name.localeCompare(b.data.name);
  });
}
