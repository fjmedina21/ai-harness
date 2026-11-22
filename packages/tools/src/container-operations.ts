/** Fixed host test probes. Never registered as model tools or accepted as source text. */
const inspection = String.raw`
const fs=require('node:fs'), os=require('node:os'), net=require('node:net');
const fail=()=>{throw Error('isolation probe failed')};
if(process.getuid()!==65534||process.getgid()!==65534)fail();
const status=fs.readFileSync('/proc/self/status','utf8');
for(const rule of [/CapEff:\s+0+\n/,/CapBnd:\s+0+\n/,/NoNewPrivs:\s+1\n/,/Seccomp:\s+2\n/])if(!rule.test(status))fail();
const cg=p=>fs.readFileSync('/sys/fs/cgroup/'+p,'utf8').trim();
if(cg('memory.max')!=='268435456'||cg('memory.swap.max')!=='0'||cg('pids.max')!=='64')fail();
const cpu=cg('cpu.max').split(' ').map(Number);if(cpu[0]/cpu[1]!==0.5)fail();
if(Object.values(os.networkInterfaces()).flat().some(x=>!x.internal))fail();
const mounts=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n');
const root=mounts.find(x=>x.split(' ')[4]==='/');if(!root||!root.split(' ')[5].split(',').includes('ro'))fail();
const tmp=mounts.find(x=>x.split(' ')[4]==='/tmp');if(!tmp||!['rw','nosuid','nodev','noexec'].every(v=>tmp.split(' ')[5].split(',').includes(v)))fail();
if(fs.existsSync('/var/run/docker.sock')||fs.existsSync('/run/docker.sock'))fail();
const st=fs.statfsSync('/tmp');if(Number(st.bsize)*Number(st.blocks)>16777216)fail();
if(fs.readdirSync('/tmp').length!==0)fail();
fs.writeFileSync('/tmp/harness-probe',Buffer.alloc(4096));fs.unlinkSync('/tmp/harness-probe');
try{fs.writeFileSync('/harness-root-probe','x');fail()}catch(e){if(!['EROFS','EACCES'].includes(e.code))throw e}
const socket=net.connect({host:'203.0.113.1',port:9});
socket.setTimeout(250,()=>{socket.destroy();fail()});
socket.on('connect',()=>{socket.destroy();fail()});
socket.on('error',()=>console.log(JSON.stringify({uid:65534,capabilities:'none',seccomp:2,noNewPrivileges:true,rootReadonly:true,tmpfsBytes:16777216,network:'denied',memoryBytes:268435456,swapBytes:0,pids:64,cpu:0.5})));
`;
export const FIXED_CONTAINER_OPERATIONS = Object.freeze({
  "node.version": Object.freeze(["--version"] as const),
  "isolation.inspect": Object.freeze(["-e", inspection] as const),
  "isolation.wait": Object.freeze(["-e", "setInterval(()=>{},1000)"] as const),
} as const);
export type FixedContainerOperation = keyof typeof FIXED_CONTAINER_OPERATIONS;
