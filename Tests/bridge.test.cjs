'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {PresenceBridge,requestPresence}=require('../app/bridge.cjs');
test('authenticated loopback presence connects, expires and disconnects; credentials stay local',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shadowcyrene-bridge-test-')),file=path.join(dir,'bridge.json');let time=1000;const changes=[];
  const bridge=await new PresenceBridge({file,now:()=>time,onChange:v=>changes.push(v)}).start();
  try{
    assert.equal((await requestPresence(file,'client1')).petRunning,true);assert.equal(bridge.active,true);
    if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o077,0);
    time+=13000;bridge.sweep();assert.equal(bridge.active,false);
    await requestPresence(file,'client2');await requestPresence(file,'client2',false);assert.equal(bridge.active,false);
    const data=JSON.parse(fs.readFileSync(file));const status=await new Promise(resolve=>http.get({hostname:'127.0.0.1',port:data.port,path:'/status'},res=>{res.resume();resolve(res.statusCode);}));assert.equal(status,403);
    assert.deepEqual(changes,[true,false,true,false]);
  }finally{await bridge.stop();assert.equal(fs.existsSync(file),false);fs.rmSync(dir,{recursive:true,force:true});}
});
