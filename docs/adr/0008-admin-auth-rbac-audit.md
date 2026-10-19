# ADR-0008: Admin authentication, RBAC for 8 roles, and audit logs

- **Status:** Accepted (role names are a default proposal, adjustable before Phase 2)
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D6, D7
- **بالعربي:** جلسات DB opaque بـ scrypt، وRBAC بصلاحيات ثابتة في الكود مع deny-by-default واختبار مصفوفة، وaudit غير قابل للتعديل داخل نفس transaction.

## Context
Only staff authenticate. Customers are guests. Permissions must be enforced in the backend, and every administrative change must be traceable.

## Decision
- Server-side sessions in Postgres. The token is 256-bit random, only its hash is stored, and it travels in an `HttpOnly`, `SameSite=Lax` cookie. `Secure` is controlled by an env flag so HTTP development keeps working.
- Passwords use `node:crypto` scrypt, minimum 12 characters. Login has rate limiting and lockout with generic error messages.
- CSRF: `SameSite`, an `Origin` check on every non-GET request, and JSON-only bodies.
- TOTP two-factor for Owner and Admin is required before launch (Phase 12).
- Default roles: Owner, Admin, Catalog Manager, Inventory Manager, Order Manager, Customer Support, Content and SEO Editor, Analyst (read-only). Roles map to permissions through a static map in `packages/shared`.
- Every admin route declares its permission (for example `products:update`). Deny by default. Startup and CI fail if a route has no permission. A matrix test exercises every route with every role.
- Access to customer personal data and to cost prices are separate permissions.
- `audit_logs` records who, what, when, from where, and a before/after diff with sensitive fields masked, in the same transaction as the change. It also records failed logins and denied permissions. It is append-only.

## Options considered
- JWT access and refresh tokens: hard to revoke, role changes are not immediate.
- An auth library (Better Auth, Lucia): acceptable, but adds a dependency and schema coupling for an admin-only login.

## Consequences
- Immediate revocation and permission changes. Session storage and cleanup are our responsibility.

## Revisit when
Customer accounts or single sign-on are introduced.
