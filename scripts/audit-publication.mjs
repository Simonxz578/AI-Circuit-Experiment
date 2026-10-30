import {readFile,readdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
const names=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let key='';try{key=(await readFile('worker/.dev.vars','utf8')).match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1]??'';}catch{}
const findings=[];
const identities=execFileSync('git',['log','--all','--format=%ae%n%ce'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(identities.some(identity=>!identity.endsWith('@users.noreply.github.com')))findings.push('Commit history contains a non-noreply identity.');
for(const oid of execFileSync('git',['rev-list','--objects','--all'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(line=>line.split(' ')[0])){const type=execFileSync('git',['cat-file','-t',oid],{encoding:'utf8'}).trim();if(type!=='blob')continue;const content=execFileSync('git',['cat-file','blob',oid],{maxBuffer:10_000_000});if(key&&content.includes(Buffer.from(key)))findings.push('Reachable history contains a secret value.');}
for(const name of names){if(/(^|\/)(\.dev\.vars|\.env\.local|private)(\/|$)/.test(name))findings.push(name+': private file');const content=await readFile(name);if(key&&content.includes(Buffer.from(key)))findings.push(name+': secret value');const text=content.toString('utf8');if(/sk-[a-zA-Z0-9]{20,}|\/Users\/[^/]+\/|[a-zA-Z0-9._%+-]+@gmail\.com/.test(text))findings.push(name+': private identifier');}
async function scanDist(path){for(const entry of await readdir(path,{withFileTypes:true})){const full=path+'/'+entry.name;if(entry.isDirectory())await scanDist(full);else{const b=await readFile(full);if(key&&b.includes(Buffer.from(key)))findings.push(full+': secret in bundle');if(/sk-[a-zA-Z0-9]{20,}/.test(b.toString('utf8')))findings.push(full+': credential pattern');}}}
await scanDist('dist');
if(findings.length){console.error(findings.join('\n'));process.exitCode=1;}else console.log(`Publication audit passed: ${names.length} staged files and production bundle; no secret values or private paths found.`);
