#!/usr/bin/env node
/** FSP Connect Priority 1: scan current tracked text for obvious credentials, without printing secrets. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';

export const rules=[
 ['Supabase secret API key',/sb_secret_[A-Za-z0-9_-]{16,}/g],
 ['Supabase service-role JWT',/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[\w-]{80,}\.[\w-]{20,}/g],
 ['GitHub personal access token',/gh[pousr]_[A-Za-z0-9]{30,}/g],
 ['OpenAI private API key',/sk-(?:proj-)?[A-Za-z0-9_-]{30,}/g],
 ['Meta permanent access token',/EAA[A-Za-z0-9]{80,}/g],
 ['Private key block',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
 ['Hardcoded server secret',/(?:FSP_META_APP_SECRET|FSP_META_ACCESS_TOKEN|FSP_META_VERIFY_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|PRIVATE_KEY)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{32,}['"]/g]
];
export function scanSource(source,path){
 const issues=[];
 for(const [rule,re] of rules){
  re.lastIndex=0;
  for(const found of source.matchAll(re)){
   const line=source.slice(0,found.index).split('\n').length;
   issues.push({path,line,rule}); // deliberately never print any matching value
  }
 }
 return issues;
}
const executable=process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href;
if(executable){
 const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const textExt=new Set(['.js','.mjs','.ts','.json','.md','.sql','.yml','.yaml','.html','.css','.toml','.example','.txt']);
 const targets=paths.filter(path=>textExt.has(extname(path))||path==='.env.example');
 const findings=[];
 for(const path of targets){
  let contents;
  try{contents=readFileSync(path,'utf8')}catch{continue}
  findings.push(...scanSource(contents,path));
 }
 console.log('FSP tracked-source audit: '+targets.length+' files scanned; '+findings.length+' high-confidence findings.');
 for(const item of findings)console.error(item.path+':'+item.line+' ['+item.rule+']');
 if(findings.length)process.exitCode=1;
 console.log('NOTE: passing does not cover Git history, untracked files, hosted secrets, or credentials outside Git.');
}
