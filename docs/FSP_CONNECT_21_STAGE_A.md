# FSP Connect 2.1 — Stage A safe backend foundation

This is **not a live WhatsApp integration** and **does not send messages**. The accepted v2.0 prototype remains unchanged.

The service under `services/api` uses Node.js 22+ and no external packages.

- `GET /healthz`: liveness only.
- `GET /readyz`: HTTP 503, because durable processing is not configured.
- `GET /webhooks/whatsapp`: Meta verification challenge with strict token check.
- `POST /webhooks/whatsapp`: verifies `x-hub-signature-256` over raw request bytes; returns 503 even for valid signatures until durable processing is implemented. It must not be exposed to Meta yet.

Local verification:

```bash
cd services/api
npm test
npm run check
```

Optional local-only run: securely supply `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET` through process environment, then run `npm start`. It binds only to 127.0.0.1:8787.

## Next work

Operator Auth and API authorization, transactional event storage/idempotency, durable job processing, staging Meta test phone and then live Inbox integration. No production DNS, migration, CRM integration or real messages are authorized by this scaffold.
