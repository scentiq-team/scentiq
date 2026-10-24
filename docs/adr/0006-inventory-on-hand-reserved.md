# ADR-0006: Inventory model — on_hand / reserved with atomic reservation

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D12
- **بالعربي:** المخزون بنموذج on_hand/reserved، والحجز بتحديث شرطي ذري داخل transaction الطلب، وقيود CHECK، وledger لا يُعدَّل لكل حركة.

## Context
Overselling and negative stock destroy trust and cost money, and concurrent checkouts are the normal case once ads run.

## Decision
- Per variant: `on_hand` (physical), `reserved` (promised to open orders), `available = on_hand - reserved`.
- Lifecycle: order placed -> `reserved += q`; cancelled before shipping -> `reserved -= q`; handed to courier -> `on_hand -= q` and `reserved -= q`; failed delivery or return -> staff chooses restock or write-off; goods received or stock count -> `on_hand` changes with a mandatory reason.
- Every action writes an immutable row to `inventory_movements` (type, deltas, order, actor, reason, time).
- Reservation inside the order transaction uses one conditional atomic `UPDATE ... SET reserved = reserved + q WHERE on_hand - reserved >= q`, checking that exactly one row changed. If any line fails, the whole order rolls back and the customer is told which lines are short. Lines are processed in `variant_id` order to avoid deadlocks. READ COMMITTED is sufficient.
- CHECK constraints are the last line of defence against negative or over-reserved stock.
- The cart does not reserve stock (no timers). The final check happens on submit and shows a clear Arabic message on conflict.
- Scarcity text such as "only X left" is computed from `available` below a configurable threshold. It is never editable text.
- A nightly job verifies `on_hand = sum of movements` and `reserved = sum of open order lines`, and alerts the Owner on drift.
- Unconfirmed orders that hold stock raise an alert in Studio. There is no automatic cancellation.

## Options considered
- Read-then-write in application code: race conditions, rejected.
- `SELECT ... FOR UPDATE` then update: correct, more round trips.
- Full event sourcing: unnecessary complexity.

## Consequences
- Stock can be trusted. Stale unconfirmed orders need human follow-up.

## Revisit when
Multiple warehouses are introduced, or timed cart reservations are required for online payments.
