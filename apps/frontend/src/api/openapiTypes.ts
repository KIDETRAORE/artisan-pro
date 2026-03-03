// apps/frontend/src/api/openapiTypes.ts
import type { paths } from "./generated/openapi";

// Méthodes HTTP supportées
type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

// Accès sûr à une operation (paths["/x"]["get"] etc.)
type Operation<P extends keyof paths, M extends HttpMethod> =
  paths[P] extends Record<string, any> ? paths[P][M] : never;

// Récupère le JSON de réponse (content application/json)
type JsonContent<R> = R extends { content: { "application/json": infer J } }
  ? J
  : never;

// 200 JSON
export type Json200<P extends keyof paths, M extends HttpMethod> =
  Operation<P, M> extends { responses: infer RESP }
    ? 200 extends keyof RESP
      ? JsonContent<RESP[200]>
      : never
    : never;

// Erreur JSON (ex: 401/403/etc.)
export type JsonError<
  P extends keyof paths,
  M extends HttpMethod,
  S extends number
> = Operation<P, M> extends { responses: infer RESP }
  ? S extends keyof RESP
    ? JsonContent<RESP[S]>
    : never
  : never;

// Path params
export type PathParams<P extends keyof paths, M extends HttpMethod> =
  Operation<P, M> extends { parameters: { path: infer PP } } ? PP : never;