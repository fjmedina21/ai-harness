/** Trusted fixed receiver. Only this host-owned program is an entrypoint; source is stdin data.
 * This Node-only profile retains the 16 MiB noexec tmpfs and never runs native artifacts. */
export const VALIDATION_RECEIVER = String.raw`
'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto'), os=require('node:os'), cp=require('node:child_process');
const fail=()=>{throw Error('validation receiver rejected input')};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'), hex=/^[a-f0-9]{64}$/, ident=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!==keys.sort().join())fail()};
const safe=p=>{if(typeof p!=='string'||p.length>240||!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(p))fail();
 const parts=p.split('/');if(parts.some(x=>!x||x.startsWith('.')||x.endsWith('.')||/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x)||/^(?:node_modules|dist|coverage|vendor|credentials|secrets)$/i.test(x)||/^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(x))||/(?:^|\/)(?:id_rsa|id_ed25519)(?:$|\.)|\.(?:pem|key|p12|pfx)$/i.test(p))fail();return p};
if(process.getuid()!==65534||process.getgid()!==65534)fail();
const status=fs.readFileSync('/proc/self/status','utf8');
for(const rule of [/CapEff:\s+0+\n/,/CapBnd:\s+0+\n/,/NoNewPrivs:\s+1\n/,/Seccomp:\s+2\n/])if(!rule.test(status))fail();
const cg=p=>fs.readFileSync('/sys/fs/cgroup/'+p,'utf8').trim();
if(cg('memory.max')!=='268435456'||cg('memory.swap.max')!=='0'||cg('pids.max')!=='64')fail();
const cpu=cg('cpu.max').split(' ').map(Number);if(cpu[0]/cpu[1]!==0.5)fail();
if(Object.values(os.networkInterfaces()).flat().some(x=>!x.internal))fail();
const mounts=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n'), rootMount=mounts.find(x=>x.split(' ')[4]==='/'), tmpMount=mounts.find(x=>x.split(' ')[4]==='/tmp');
if(!rootMount||!rootMount.split(' ')[5].split(',').includes('ro')||!tmpMount||!['rw','nosuid','nodev','noexec'].every(v=>tmpMount.split(' ')[5].split(',').includes(v)))fail();
const stats=fs.statfsSync('/tmp');if(Number(stats.bsize)*Number(stats.blocks)>16777216||fs.readdirSync('/tmp').length!==0)fail();
let total=0;const chunks=[];process.stdin.on('data',data=>{total+=data.length;if(total>6291456){process.stdin.destroy();process.exitCode=70}else chunks.push(data)});
process.stdin.on('end',()=>{try{
 if(total>6291456)fail();const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));exact(input,['snapshot','action']);exact(input.snapshot,['manifest','contents']);
 const m=input.snapshot.manifest;exact(m,['manifestVersion','snapshotId','executionId','workspaceId','sourceRevision','policyVersion','policyDigest','snapshotDigest','files','totalBytes','transferDigest']);
 if(m.manifestVersion!==1||![m.snapshotId,m.executionId,m.workspaceId,m.policyVersion].every(x=>typeof x==='string'&&ident.test(x))||![m.sourceRevision,m.policyDigest,m.snapshotDigest,m.transferDigest].every(x=>typeof x==='string'&&hex.test(x))||!Array.isArray(m.files)||m.files.length<1||m.files.length>256||!Number.isSafeInteger(m.totalBytes)||m.totalBytes<0||m.totalBytes>4194304)fail();
 if(!Array.isArray(input.snapshot.contents)||input.snapshot.contents.length!==m.files.length)fail();
 let previous='',bytes=0;const aliases=new Set(),data=[];
 for(let i=0;i<m.files.length;i++){const f=m.files[i];exact(f,['path','hash','bytes']);safe(f.path);const alias=f.path.toLowerCase();if(f.path<=previous||aliases.has(alias)||[...aliases].some(p=>p.startsWith(alias+'/')||alias.startsWith(p+'/'))||typeof f.hash!=='string'||!hex.test(f.hash)||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>1048576)fail();
  const b64=input.snapshot.contents[i];if(typeof b64!=='string'||b64.length>1398104)fail();const b=Buffer.from(b64,'base64');if(b.toString('base64')!==b64||b.length!==f.bytes||hash(b)!==f.hash)fail();
  previous=f.path;aliases.add(f.path.toLowerCase());bytes+=b.length;data.push(b)}
 const unsigned={manifestVersion:m.manifestVersion,snapshotId:m.snapshotId,executionId:m.executionId,workspaceId:m.workspaceId,sourceRevision:m.sourceRevision,policyVersion:m.policyVersion,policyDigest:m.policyDigest,snapshotDigest:m.snapshotDigest,files:m.files.map(f=>({path:f.path,hash:f.hash,bytes:f.bytes})),totalBytes:m.totalBytes};
 if(bytes!==m.totalBytes||hash(JSON.stringify(m.files))!==m.snapshotDigest||hash(JSON.stringify(unsigned))!==m.transferDigest)fail();
 const a=input.action;exact(a,['id','runtimeProfile','image','executable','args','workingDirectory','timeoutMs','maxOutputBytes','network','resources']);exact(a.resources,['cpu','memoryBytes','pids']);
 if(typeof a.id!=='string'||!/^[a-z][a-z0-9._-]{0,63}$/.test(a.id)||a.runtimeProfile!=='node-isolated-v1'||a.executable!=='node'||a.network!=='none'||!Array.isArray(a.args)||a.args.length<1||a.args.length>32||a.args.some(x=>typeof x!=='string'||!x||x.length>256||/[\0\r\n]/.test(x))||!Number.isSafeInteger(a.timeoutMs)||a.timeoutMs<1||a.timeoutMs>10000||!Number.isSafeInteger(a.maxOutputBytes)||a.maxOutputBytes<1||a.maxOutputBytes>1024||a.resources.cpu!==0.5||a.resources.memoryBytes!==268435456||a.resources.pids!==64)fail();
 if(a.workingDirectory!=='')safe(a.workingDirectory);
 const dir=fs.mkdtempSync('/tmp/harness-');fs.chmodSync(dir,0o700);const parents=new Set([dir]);
 for(let i=0;i<m.files.length;i++){const f=m.files[i],dest=path.join(dir,f.path);fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});const fd=fs.openSync(dest,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o400);try{fs.writeFileSync(fd,data[i]);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  const st=fs.lstatSync(dest);if(!st.isFile()||st.nlink!==1||st.size!==f.bytes||hash(fs.readFileSync(dest))!==f.hash)fail();let p=path.dirname(dest);while(p.startsWith(dir)){parents.add(p);if(p===dir)break;p=path.dirname(p)}}
 const cwd=path.join(dir,a.workingDirectory);if(fs.realpathSync(cwd)!==cwd||!fs.statSync(cwd).isDirectory()||!(cwd===dir||cwd.startsWith(dir+'/')))fail();
 for(const p of [...parents].sort((x,y)=>y.length-x.length))fs.chmodSync(p,0o500);
 const child=cp.spawn(process.execPath,a.args,{shell:false,cwd,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/nonexistent',TMPDIR:'/tmp'},stdio:['ignore','pipe','pipe']});
 const output=[];let count=0,kind=null;const stop=k=>{kind=kind||k;try{child.kill('SIGKILL')}catch{}};
 const timer=setTimeout(()=>stop('timeout'),a.timeoutMs);const capture=b=>{if(kind)return;count+=b.length;if(count>a.maxOutputBytes){stop('output_limit');return}output.push(Buffer.from(b))};
 child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',()=>stop('start_failed'));
 child.on('close',code=>{clearTimeout(timer);console.log(JSON.stringify({version:1,snapshotDigest:m.snapshotDigest,transferDigest:m.transferDigest,staging:'verified',exitCode:code,kind,output:Buffer.concat(output).toString('base64')}))});
 }catch{process.stderr.write('validation receiver rejected input');process.exitCode=70}});
`;
