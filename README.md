# Standard Barrels Inventory Taker frontend

React, TypeScript and Vite PWA connected to the supplied Express backend. Start the backend on port 5000, then run `pnpm install` and `pnpm dev`. The frontend runs on port 3000; set `VITE_API_PROXY_TARGET` if the backend uses another address.

Tailwind CSS is configured through the official Vite plugin and `src/tailwind.css`. Preflight is omitted to preserve the current styling. New utilities use the `tw:` prefix, such as `tw:flex` and `tw:bg-primary`, and follow the existing palette and `data-theme` dark mode. Only frontend source is scanned.

## Backend contract used

- `POST /api/v1/auth/login` returns `{ token, data: { user } }`. The bearer JWT is held in tab memory and is cleared on reload or sign-out. Public signup is controlled by `PUBLIC_SIGNUP_ENABLED` and is omitted from this UI.
- An ADMIN can create a STAFF, MANAGER, or AUDITOR invitation on the Staff invitations screen. Copy the link when shown and share it privately. The recipient uses the link to set a name and password, then signs in. Run the backend invitation migration before using this screen. Sharing a link directly does not establish ownership of the email address.
- `GET /api/v1/sale` and `GET /api/v1/sale/:id` supply sale list/detail. Sale detail includes fulfillment IDs, dispatch history, ProductUnit quantities and payment/delivery states. `POST /api/v1/sale/create` creates a commercial order; `PATCH /api/v1/sale/:id` updates commercial fields; `POST /api/v1/sale/:id/dispatches` posts actual stock issues. Dispatch requires `INVENTORY_V2_ENABLED=true`.
- `GET /api/v1/purchase` and `GET /api/v1/purchase/:id` supply purchase list/detail and embedded receipt history. `POST /api/v1/purchase/create` creates a commercial order. `POST /api/v1/purchase/:id/receipts` creates a draft; `POST /api/v1/purchase/:id/receipts/:receiptId/post` posts stock. Receipt actions require Inventory V2.
- Master-data routes are under `/api/v1/contacts`, `/api/v1/catalog/categories`, `/api/v1/catalog/products`, nested ProductUnits, and `/api/v1/warehouses`. Reads allow all four roles; writes allow ADMIN and MANAGER.
- Inventory read routes are `/api/v1/inventory/availability`, `/low-stock`, and `/expiring-soon`; physical count is `POST /adjustments`. The latter is ADMIN/MANAGER only and requires Inventory V2 and an idempotency key.
- Customer returns are nested under `/api/v1/sale/:saleId/returns`; supplier returns are nested under `/api/v1/purchase/:purchaseId/returns`. There are no global list endpoints. Supplier return creation needs a `sourceBatchId`, but the available inventory read endpoints do not expose batch IDs for selecting a source receipt batch.

`INVENTORY_V2_ENABLED` defaults to `false` in the supplied backend, so stock-changing V2 commands return `409` or `503` until the backend is configured with the flag. The UI shows these server errors. There is no frontend feature-flag read endpoint.

## Verification and limits

- `pnpm typecheck` and `pnpm build` pass.
- Vite serves the app on port 3000. Unauthenticated calls through its proxy reach the backend and return the expected `401`.
- The login screen was visually checked in the browser. Role-specific flows still require backend credentials for live verification.
- Customer return creation, receipt, and inspection are wired to order-scoped routes. Supplier return creation is not exposed because the backend does not provide a batch discovery route. Existing supplier returns can be reviewed and posted by authorized users.
- The Vite service worker caches the shell and static assets only. It bypasses `/api/` and requests with Authorization headers; commands require a live response and are never queued.
