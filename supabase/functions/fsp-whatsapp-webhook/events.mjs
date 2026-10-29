/* Logic mirrors existing Stage A normalizer; Edge-runtime compatible node:crypto import. */
import {createHash} from 'node:crypto';
const knownTypes = new Set(['text','image','document','audio','video','interactive','template','location','contacts','reaction']);
function validId(x) { return typeof x === 'string' && x.length >= 3 && x.length <= 250; }
export function normalizeMetaEvents(data) {
  if (!data || data.object !== 'whatsapp_business_account' || !Array.isArray(data.entry) || data.entry.length > 50) {
    throw new Error('Invalid WhatsApp event envelope');
  }
  const events = [];
  for (const entry of data.entry) {
    if (!Array.isArray(entry.changes) || entry.changes.length > 100) throw new Error('Invalid changes');
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (!value || typeof value !== 'object') throw new Error('Invalid event value');
      const waba = String(entry.id ?? '').slice(0,128);
      const phone = String(value.metadata?.phone_number_id ?? '').slice(0,128);
      const names = new Map((value.contacts ?? []).filter(x => x?.wa_id).map(x => [x.wa_id, x.profile?.name]));
      for (const message of value.messages ?? []) {
        if (!validId(message?.id) || !/^[0-9]{6,20}$/.test(message?.from ?? '')) throw new Error('Invalid inbound message identifiers');
        const type = knownTypes.has(message.type) ? message.type : 'other';
        const payload = {
          wa_id:message.from, message_type:type, timestamp:String(message.timestamp ?? ''),
          profile_name:typeof names.get(message.from)==='string'?names.get(message.from).slice(0,250):null,
          body:type==='text'?String(message.text?.body ?? '').slice(0,16000):null,
          media_id:['image','document','audio','video'].includes(type)?String(message[type]?.id ?? '').slice(0,256):null
        };
        events.push({event_key:'message:'+message.id,event_type:'message',waba_id:waba,phone_number_id:phone,provider_message_id:message.id,payload});
      }
      for (const st of value.statuses ?? []) {
        if (!validId(st?.id) || !['sent','delivered','read','failed'].includes(st.status)) throw new Error('Invalid status');
        const ts=String(st.timestamp ?? '');
        const key='status:'+createHash('sha256').update(JSON.stringify([st.id,st.status,ts])).digest('hex');
        events.push({event_key:key,event_type:'status',waba_id:waba,phone_number_id:phone,
          provider_message_id:st.id,payload:{status:st.status,timestamp:ts,
            error_code:st.errors?.[0]?.code == null?null:String(st.errors[0].code).slice(0,100)}});
      }
      if (events.length > 1000) throw new Error('Too many events');
    }
  }
  return events;
}