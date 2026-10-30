import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const vars=await readFile(new URL('../worker/.dev.vars',import.meta.url),'utf8');
const key=vars.match(/^DEEPSEEK_API_KEY=(.+)$/m)?.[1];if(!key)throw new Error('Backend key not configured');
const child=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','put','DEEPSEEK_API_KEY','--config','worker/wrangler.jsonc'],{input:key+'\n',stdio:['pipe','inherit','inherit']});
process.exitCode=child.status??1;
