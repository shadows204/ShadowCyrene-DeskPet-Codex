'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');const {PassThrough,Writable}=require('node:stream');
const {QuotaClient,METHODS}=require('../app/quota-client.cjs');
test('bridge uses a real initialize handshake and read-only account RPCs',async()=>{
  const calls=[];
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  child.stdin=new Writable({write(chunk,_enc,done){
    const x=JSON.parse(chunk);calls.push(x.method);
    const reply=x.method==='initialize'?{}:x.method==='account/read'?{account:{type:'chatgpt',planType:'plus',email:'private@example.invalid'}}:x.method==='account/rateLimits/read'?{rateLimits:{primary:{usedPercent:5,windowDurationMins:300}}}:null;
    if(x.id!==undefined)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:x.id,result:reply})+'\n'));
    done();
  }});
  const client=new QuotaClient('/fake/codex',{spawnProcess:()=>child,timeout:1000});
  const accounts=[];client.on('account',a=>accounts.push(a));
  const result=await client.start();assert.equal(result.rateLimits.primary.usedPercent,5);
  assert.deepEqual(calls,['initialize','initialized','account/read','account/rateLimits/read']);
  assert.deepEqual(accounts,[{planType:'plus'}]);assert.ok(!JSON.stringify(accounts).includes('private'));
  await assert.rejects(client.call('turn/start'),/Non-read-only/);
  await assert.rejects(client.call('account/rateLimitResetCredit/consume'),/Non-read-only/);
  assert.ok(!METHODS.has('account/logout'));client.stop();
});
test('requests time out and clean their pending state',async()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  child.stdin=new PassThrough();const client=new QuotaClient('/fake',{spawnProcess:()=>child,timeout:25});
  await assert.rejects(client.start(),/超时/);assert.equal(client.pending.size,0);client.stop();
});
