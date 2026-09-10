/* The GraphQL playground. Disabled in production by the config's
   `disablePlaygroundInProduction` flag — a schema explorer is a development
   convenience, not something to leave mounted on a public origin. */
import config from "@payload-config";
import { GRAPHQL_PLAYGROUND_GET } from "@payloadcms/next/routes";

export const GET = GRAPHQL_PLAYGROUND_GET(config);
