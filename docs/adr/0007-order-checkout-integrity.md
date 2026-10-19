# ADR-0007: Order and checkout integrity, and guest-checkout abuse control

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D13, D14
- **بالعربي:** السيرفر يعيد حساب كل الأرقام من DB ولا يقبل مبالغ من العميل. الطلب idempotent ويبدأ بحالة pending_confirmation، مع rate limits متعددة المفاتيح وقائمة هواتف محظورة.

## Context
Cash on delivery with guest checkout invites fake and duplicate orders, and any client-supplied number is attackable.

## Decision
- The client sends only variant ids and quantities, address fields, customer name and phone, and an `Idempotency-Key`. The server loads prices, checks that the product is published and the variant active, enforces quantity limits, and computes subtotal, delivery fee (area -> city -> governorate fallback) and total. It stores snapshots on the order.
- Money fields sent by the client are rejected by a strict schema, not silently ignored.
- Repeating a request with the same key returns the same order.
- Order numbers are random (for example `SQ-8F3K2M`), never sequential. Order tracking requires order number plus phone and is rate limited.
- Phones are normalized to E.164 and validated as Iraqi mobile numbers. The current operator prefixes are verified in Phase 6B.
- Abuse controls: rate limits keyed by IP, phone and combinations (mobile networks often share one IP, so IP alone is never the only key); honeypot field and minimum fill time; duplicate detection (same phone and items within 10 minutes returns the existing order); `blocked_phones` managed in Studio; cap on open orders per phone. Cloudflare Turnstile is available behind an env flag and is off by default.
- Orders start as `pending_confirmation`, and staff confirm by phone.
- Statuses: `pending_confirmation`, `confirmed`, `preparing`, `handed_to_courier`, `delivered`, plus `cancelled`, `failed_delivery`, `returned`. Allowed transitions are a tested matrix. An illegal transition returns 409.
- A separate permission controls access to customer personal data. Logs never contain phone or address. A retention policy is defined in Phase 12.
- Wishlist and recently viewed live in the browser only. There are no customer accounts in v1.

## Options considered
- SMS OTP at checkout: reliable but adds cost and friction, deferred.
- Mandatory CAPTCHA: friction on every order, kept as a switch.

## Consequences
- Staff effort for confirmation calls. Strong protection against fake orders and tampering.

## Revisit when
Online payments are added, or abuse is observed that the controls above do not stop.
