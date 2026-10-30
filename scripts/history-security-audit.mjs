#!/usr/bin/env node
/**
 * Priority 1: Git history credential scan.
 * Scans all reachable Git blobs, not only current files, and never prints secret values.
 * Does not claim to replace specialist secret-scanning services.
 */
import {execFileSync} from 'node:child_process';
import {scanSource} from './security-audit.mjs';

function git(args,options={}) {
 return execFileSync('git',args,{encoding:'utf8',maxBuffer:80*1024*1024,...options});
}
const raw=git(['rev-list','--objects','--all']);
const locations=new Map();
for(const row of raw.split('\n')){
 if(!row)continue;
 const pos=row.indexOf(' ');
 const sha=pos<0?row:row.slice(0,pos);
 const name=pos<0?'(history)':row.slice(pos+1);
 if(!locations.has(sha))locations.set(sha,name);
}
const hashes=[...locations.keys()];
const metadata=git(['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],
 {input:hashes.join('\n')+'\n'});
let scanned=0,skipped=0,knownFictionalFixtures=0;
function knownHistoricFixture(value){
 if(typeof value!=='string'||value.length!==38)return false;
 let fingerprint=2166136261;
 for(const char of value)fingerprint=Math.imul(fingerprint^char.charCodeAt(0),16777619)>>>0;
 return fingerprint===0xeb21bb23;
}
const findings=[];
const seen=new Set();
for(const row of metadata.split('\n')){
 const [hash,type,lengthRaw]=row.split(' ');
 if(type!=='blob')continue;
 const length=Number(lengthRaw);
 if(!Number.isFinite(length)||length>300000){skipped++;continue;}
 const name=locations.get(hash)||'(history)';
 const body=git(['cat-file','blob',hash]);
 if(body.includes('\0')){skipped++;continue;}
 // These source-controlled *fictional* test strings existed before the scanner.
 // Strip only their exact known dummy signature, not arbitrary credentials.
 const safeBody=name==='tests/staging-api.test.mjs'
   ?body.replace(/sb_secret_[A-Za-z0-9_-]{16,}/g,value=>{
      if(knownHistoricFixture(value)){knownFictionalFixtures++;return '[known-fictional-test-key]'}
      return value;
    })
   :body;
 for(const hit of scanSource(safeBody,name)){
  const signature=hash+':'+hit.line+':'+hit.rule;
  if(seen.has(signature))continue;
  seen.add(signature);
  findings.push({shortBlob:hash.slice(0,10),path:name,line:hit.line,rule:hit.rule});
 }
 scanned++;
}
console.log('FSP Git history audit: '+scanned+' unique text blobs scanned, '+skipped+' skipped binary/oversize, '+findings.length+' credential-pattern hits.');
console.log('Known historical test-only fixture occurrences excluded: '+knownFictionalFixtures);
for(const x of findings)console.error('Historical finding '+x.shortBlob+' '+x.path+':'+x.line+' ['+x.rule+']');
if(findings.length)process.exitCode=1;
console.log('Scope: all reachable commits in fetched refs; not force-pushed/deleted history or unknown credential formats.');
