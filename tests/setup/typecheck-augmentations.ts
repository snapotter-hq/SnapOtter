// Type-only: apps/api routes use the `config.rateLimit` option that
// @fastify/rate-limit adds to FastifyContextConfig. The API's own tsconfig
// picks that up through apps/api/src/index.ts, which the tests/ typecheck does
// not pull in, so load the augmentation here.
import type {} from "@fastify/rate-limit";
