import type { APIRoute } from 'astro';
import { entryJsonSchema } from '../lib/export.ts';

export const GET: APIRoute = () => Response.json(entryJsonSchema());
