# ADR-0003: Backend — Fastify 5, Zod 4, REST

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D3, D16 (Node version)
- **بالعربي:** Fastify مع Zod وREST تحت `/api/v1`. الـ backend يرجع أكواد أخطاء والـ frontend يترجمها للعربية.

## Context
The backend is the source of truth for price, stock, delivery fee, order total and permissions. It needs strict validation, typed contracts shared with the frontend, and a small dependency footprint.

## Decision
- Node 24 LTS, TypeScript strict, Fastify 5.
- Zod 4 schemas live in `packages/shared` and are used for request validation, response typing and OpenAPI generation (`fastify-type-provider-zod`).
- REST under `/api/v1`, split into `public/*` (cacheable GETs and checkout) and `admin/*` (session cookie plus RBAC).
- Errors follow problem+json with stable error codes. The server returns codes, not display text, and the frontend maps them to Arabic or English.
- `Idempotency-Key` is required on order creation.
- Layering: `routes` (HTTP only) -> `service` (business rules and transactions) -> `repository` (SQL). Routes never touch the database.
- Config comes from env only, validated with Zod at startup (`node --env-file`, no dotenv). Logging uses pino with redaction of phone, address and tokens.

## Options considered
- Express 5: familiar, but needs more glue for validation and typing.
- NestJS: too heavy for this size.
- Hono: viable, but the Node plugin ecosystem for multipart, cookies and rate limiting is stronger on Fastify.
- tRPC or GraphQL: rejected. They couple frontend and backend by code, while the brief requires an isolated backend with an explicit contract.

## Consequences
- One schema gives validation, types and API docs.
- Team members need to learn the Fastify plugin model.

## Revisit when
A second client (mobile app, partner API) needs a versioned public contract. Then freeze `/api/v1` and publish the OpenAPI spec.
