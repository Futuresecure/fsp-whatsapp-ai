/** Build a safe PostgREST filter for authorized Inbox conversations. Never handles operator scope. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function buildConversationSearchWhere({query='',filter='all'}={}){
 if(typeof filter!=='string'||!['all','unread','open','resolved'].includes(filter))
  return {ok:false,error:'Invalid conversation filter'};
 if(typeof query!=='string')return {ok:false,error:'Invalid conversation search'};
 const search=query.trim();
 // Accept Tamil combining marks, names, digits, spaces and phone prefixes.
 // Reject wildcard, commas, parentheses, colons, quotes and PostgREST operators.
 if(search.length>60||(search&&!/^[\p{L}\p{M}\p{N} _+-]+$/u.test(search)))
  return {ok:false,error:'Search accepts letters, numbers and spaces (maximum 60)'};
 let where='';
 if(filter==='unread')where+='&unread_count=gt.0';
 if(filter==='open'||filter==='resolved')where+='&status=eq.'+filter;
 if(search){
  const criteria=[
   'contact_name.ilike.*'+search+'*',
   'contact_wa_id.ilike.*'+search+'*',
   'status.ilike.*'+search+'*'
  ];
  if(UUID.test(search))criteria.push('id.eq.'+search);
  where+='&or='+encodeURIComponent('('+criteria.join(',')+')');
 }
 return {ok:true,where};
}
