import type { APIRoute } from 'astro';
import { toRecord } from '../lib/export.ts';
import { publishedProjects } from '../lib/projects.ts';

// Every published entry as JSON, for harvesting and reuse. The fields follow /schema.json.
export const GET: APIRoute = async ({ site }) => {
  const base = new URL(import.meta.env.BASE_URL, site);
  return Response.json((await publishedProjects()).map((p) => toRecord(p, base)));
};
