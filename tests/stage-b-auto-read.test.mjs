import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAutoReadFilter} from '../supabase/functions/fsp-connect-staging-api/auto-read.mjs';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const op = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const t = '2026-10-29T13:55:00.000Z';
const now = Date.parse('2026-10-29T14:00:00Z');
const build = (extra = {}) => {
  const args={conversationId:id,observedLastMessageAt:t,observedUnreadCount:2,now,...extra};
  const result=buildAutoReadFilter(args);
  if(result===null && Object.keys(extra).length===0){
    console.error('Fixture diagnostic',JSON.stringify({
      now, observed:Date.parse(t), idLength:id.length, idValid:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      countValid:Number.isSafeInteger(args.observedUnreadCount),timestampType:typeof args.observedLastMessageAt
    }));
  }
  return result;
};

test('valid snapshot includes equality guard for unread count and timestamp upper bound', () => {
  const f = build();
  assert.ok(f.startsWith(`?id=eq.${id}&unread_count=eq.2&last_message_at=lte.`));
  assert.ok(f.includes(encodeURIComponent(t)));
  assert.ok(!f.includes('assigned_to'));
});

test('restricted operator filter enforces assigned_to', () => {
  assert.ok(build({assignedTo:op}).endsWith(`&assigned_to=eq.${op}`));
});

test('empty and zero counts do not perform redundant writes', () => {
  assert.equal(build({observedUnreadCount:0}), null);
  assert.equal(build({observedUnreadCount:-1}), null);
  assert.equal(build({observedUnreadCount:1.5}), null);
});

test('refuses missing, invalid and future timestamps', () => {
  for(const value of [null, '', 'not-a-date', '2026-10-29T14:02:00Z', '2'.repeat(70)]) {
    assert.equal(build({observedLastMessageAt:value}), null);
  }
});

test('refuses invalid identifiers and attempted injected filters', () => {
  assert.equal(build({conversationId:'abcd&unread_count=eq.0'}), null);
  assert.equal(build({assignedTo:'x&unread_count=eq.0'}), null);
});

test('rejects unsafe count values', () => {
  assert.equal(build({observedUnreadCount:Infinity}), null);
  assert.equal(build({observedUnreadCount:1_000_001}), null);
});

test('normalizes timestamps into ISO so different time zone expressions retain cursor', () => {
  const result = build({observedLastMessageAt:'2026-10-29T19:25:00+05:30'});
  assert.ok(result.includes(encodeURIComponent('2026-10-29T13:55:00.000Z')));
});

test('does not allow database clock future cursor', () => {
  assert.equal(build({observedLastMessageAt:'2026-10-29T14:01:10.000Z'}), null);
});
