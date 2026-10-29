/**
 * Stage B Inbox: guarded internal auto-mark-as-read.
 * Does not send a WhatsApp read receipt; only clears local FSP Inbox unread count.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export function buildAutoReadFilter({conversationId, observedLastMessageAt, observedUnreadCount, assignedTo, now=Date.now()}) {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) return null;
  if (!Number.isSafeInteger(observedUnreadCount) || observedUnreadCount < 1 || observedUnreadCount > 1000000) return null;
  if (typeof observedLastMessageAt !== 'string' || observedLastMessageAt.length > 60) return null;
  const observed = Date.parse(observedLastMessageAt);
  if (!Number.isFinite(observed) || observed > now + 60000) return null;
  let filter = '?id=eq.' + encodeURIComponent(conversationId)
    + '&unread_count=eq.' + observedUnreadCount
    + '&last_message_at=lte.' + encodeURIComponent(new Date(observed).toISOString());
  if (assignedTo !== null && assignedTo !== undefined) {
    if (typeof assignedTo !== 'string' || !UUID.test(assignedTo)) return null;
    filter += '&assigned_to=eq.' + encodeURIComponent(assignedTo);
  }
  return filter;
}
