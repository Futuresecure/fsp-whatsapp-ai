import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSource} from '../scripts/security-audit.mjs';

test('rejects server-only Supabase secret key without including its value in the result',()=>{
 const fake='sb_secret_'+ 'A'.repeat(28);
 const hits=scanSource('const key="'+fake+'";','fixture.js');
 assert.ok(hits.length>0);
 assert.equal(hits[0].path,'fixture.js');
 assert.equal(hits[0].line,1);
 assert.ok(!JSON.stringify(hits).includes(fake));
});
test('detects hard-coded credentials',()=>{
 const secret='FSP_META_APP_SECRET="'+'A'.repeat(45)+'"';
 assert.ok(scanSource(secret,'mock.env').length>0);
});
test('public publishable key does not count as a server secret',()=>{
 assert.equal(scanSource('const key="sb_publishable_'+'A'.repeat(25)+'";','app.js').length,0);
});
test('safe env lookups and placeholder examples do not trigger scanner',()=>{
 assert.equal(scanSource("const x=Deno.env.get('FSP_META_APP_SECRET')",'backend.ts').length,0);
});
