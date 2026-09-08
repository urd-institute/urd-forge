# Coffee Log — living documentation

## Architecture in one paragraph

A local-first React SPA. All state lives in localStorage behind a small storage
module with a versioned schema (v2 as of 2026-07-21). No backend, no accounts.
Stats are computed client-side on demand.

## ADR log

### ADR-001 — Local-first, no backend
**Date:** 2026-07-03. **Decision:** all data in localStorage; no server, no accounts.
**Alternatives:** hosted DB (rejected: overkill, privacy cost), file-based sync
(deferred to export/import in SPEC-04). **Consequence:** sharing requires
encoding data into the link itself (constrains SPEC-05).

### ADR-002 — No bean-shop integration in v1
**Date:** 2026-07-09. **Decision:** beans are free-text, not a product catalogue.
**Alternatives:** shop APIs (rejected: maintenance burden, scope creep).
**Consequence:** stats group by free-text bean name; fuzzy matching may be needed later.

### ADR-003 — Ratings are 1–5, stored as integers
**Date:** 2026-07-21. **Decision:** replaced the 1–10 scale after real use.
**Consequence:** schema migration v1→v2 maps old ratings by halving, rounded up.
