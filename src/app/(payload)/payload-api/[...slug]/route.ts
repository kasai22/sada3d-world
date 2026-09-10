/* Payload REST API. Owned by Payload.

   Mounted because the admin panel calls it. Every collection therefore states
   its own access rules explicitly — see src/payload/access.ts — because these
   endpoints answer anonymous requests and Payload's default is permissive.
   Public reads are restricted to published documents by a database-level
   `where`, and the users collection is closed entirely. */
import config from "@payload-config";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";

export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
