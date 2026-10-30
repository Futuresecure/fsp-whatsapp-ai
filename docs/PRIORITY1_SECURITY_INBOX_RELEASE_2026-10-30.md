# FSP Connect 2.1 — Priority 1 Release and Security Review (30 October 2026)

## Deployment evidence
- Current work branch: dev. The accepted offline 2.0 prototype was not edited.
- Supabase Edge API: fsp-connect-staging-api v13 ACTIVE; webhook: fsp-whatsapp-webhook v7 ACTIVE.
- GitHub Pages staging frontend: deployed successfully; JavaScript and CSS versioned for cache invalidation.
- GitHub CI: Staging API Verification PASS; Pages deployment PASS.
- No production customer send path enabled or activated by this change.

## Security controls implemented and verified
- Operator API requires fresh Supabase Auth bearer JWT and an active operator role, checked server-side.
- Agent/Viewer scoping remains enforced in read and mutation paths.
- Conversation list now enriches names/phone values **only after** retrieving conversations in the authorized operator scope.
- API CORS allow-origin changed from wildcard to https://futuresecureproviders.com; automated preflight QA PASS.
- Source credential scanner: 58 tracked text files scanned, 0 high-confidence findings after fictional test fixture cleanup. Scanner and unit tests now run in CI. This scan does not cover Git history, untracked files, hosted secrets, or custom private formats.
- Supabase tables retain RLS enabled. Auth Security Advisor still warns that leaked-password protection is disabled.

## Inbox Stage 1 completed
- Poll authorized conversations every 15 seconds while Inbox is open and the browser tab is visible.
- Quietly update message history and provider status without resetting the reply draft.
- Search the loaded authorized conversation page by contact name, WhatsApp number, status, or conversation ID.
- Show All, Unread, Open, Resolved filters and visually emphasize unread rows.
- Preserve conversation selection, note input, and scroll position during quiet updates.
- Keep guarded internal automatic mark-as-read for viewed messages; stale snapshots cannot erase newer unread messages.
- Browser-like unit tests cover filtering, polling, focus safety and unread updates.

## Production manual reply readiness
- Added GET /api/reply-readiness (Admin only, read-only) and a matching Settings check.
- This checks whether the restricted test recipient and provider configuration are ready, and reports the remaining release blockers without exposing tokens, phone IDs or test recipients.
- It **does not** create or enable unrestricted customer messages.
- Restricted test-only manual replies remain behind the exact allowlist, 24-hour inbound service window, role access and durable UUID request-id claims.
- Current live messages before change: 3 (2 inbound, 1 outbound), 1 conversation. No new WhatsApp messages were sent by the audit/deployment.

## Unresolved blockers before full production
1. GitHub repository is publicly visible. Decide on hosting/source privacy, validate Pages/plan impact before changing visibility, and audit earlier history for accidentally committed credentials.
2. Supabase Auth leaked-password protection warning requires administrative review (may depend on plan).
3. Full production customer replies need separately approved endpoint, operator authorization, rate limits, anti-abuse logging, non-test pilot, rollback, and live acceptance; they remain OFF.
4. Inbox still needs text search across all conversations (current search covers first 50 authorized conversations only), richer media handling, older-message pagination and optional notifications.
5. Multi-operator real-world role matrix, security testing, restore drill, monitoring alerts and privacy/retention policy remain pending.

## QA and rollback
- Automated tests for reply-readiness fail-closed behavior, Inbox polling, filters, session retention, webhook and reply guards, and secret scanning PASS.
- To roll back new frontend behavior, revert staged dev frontend files, rebuild GitHub Pages; to roll back API, deploy prior verified Edge API version. Preserve database messages and event history.
- Do not remove the allowlist or set any future production send flag until explicit go-live acceptance.
