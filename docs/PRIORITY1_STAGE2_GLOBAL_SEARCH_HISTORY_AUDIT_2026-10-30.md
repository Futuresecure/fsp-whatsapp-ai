# FSP Connect 2.1 — Priority 1 Stage 2
Date: 30 October 2026

## Scope
Standalone FSP Connect 2.1 only. No modification to accepted offline 2.0, unrelated CRM, or customer messaging settings.

## Implementation
- Database migration 20261030044027_fsp_conversation_search_invoker_view adds a read-only security-invoker view joining contacts to conversations.
- SELECT access on the view is revoked from PUBLIC, anon and authenticated, granted only to service_role. API applies fresh auth/operator role and agent assigned-to scope before paginating.
- Operator API GET /api/conversations now accepts validated Unicode search q, filter all/unread/open/resolved, bounded limit and offset; responds with total and has_more.
- Inbox supports server-side name/number search across all conversations, load more pagination and stale-request cancellation.
- 15-second Inbox refresh preserves older loaded conversations, message history, notes and reply draft.
- Overview description updated to reflect tested live Meta integration; test-only messaging unchanged.

## Security evidence
- SQL permission checks passed: anon cannot read view, authenticated cannot read, service_role can read.
- Current tracked-source audit scanned 64 text files; zero high-confidence hits.
- Historical Git scan covers all reachable fetched refs: 140 text blobs, zero unrecognized credential patterns; one fingerprinted fictional test fixture excluded.
- CI test suite covers Tamil Unicode search, query injection rejection, pagination, legacy inbox behavior, auth, and HTTP 401 unauthorized search.
- Supabase Security Advisor warning remains: leaked-password protection disabled.
- GitHub repository remains PUBLIC; no visibility change was performed. History scan does not cover deleted/force-pushed refs or unknown token formats.

## Safety limits
- Only allowlisted test number can receive outbound replies. Production customer sending remains OFF.
- AI, Broadcast and Automation sends remain OFF.
- Customer-wide manual replies still need explicit release approval, operator role matrix QA, rate limits, monitoring, and controlled pilot.
- Existing conversation data, webhook events and audit history were not modified by the read-only search view.

## User validation and rollback
- Hard reload the staging UI and search a contact name/phone in Inbox.
- Check filter, 15s refresh, and Load More when at least 51 authorized conversations exist.
- Roll back app code and API first if needed; migration is additive and contains no customer-data mutation.
