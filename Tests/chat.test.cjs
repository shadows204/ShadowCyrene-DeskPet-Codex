'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {EventEmitter}=require('node:events');
const {ChatClient,CHAT_METHODS,conversationConfig}=require('../app/chat-client.cjs');
test('dedicated chat streams and final events do not duplicate text or accept unrelated threads',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shadowcyrene-chat-test-'));const calls=[];const rpc=new EventEmitter();rpc.accountInfo={email:'private@example.invalid'};rpc.start=async()=>{};rpc.stop=()=>{};
  rpc.call=async(method,params)=>{calls.push({method,params});if(method==='config/read')return{config:{mcp_servers:{secret:{}}}};if(method==='mcpServerStatus/list')return{data:[]};if(method==='model/list')return{data:[]};if(method==='thread/start')return{thread:{id:'own-thread'}};if(method==='turn/start')return{turn:{id:'turn-1'}};return{};};
  const client=new ChatClient('/fake',{directory:dir,rpcFactory:()=>rpc});client.on('change',()=>{});
  try{
    const result=await client.send('hello',undefined,[{name:'shot.png',input:{type:'image',url:'data:image/png;base64,AAAA'}},{name:'note.txt',input:{type:'text',text:'file body'}}]);assert.equal(result.direct,true);
    const turn=calls.find(c=>c.method==='turn/start');assert.ok(turn.params.input.some(i=>i.type==='image'&&i.url==='data:image/png;base64,AAAA'));assert.ok(turn.params.input.some(i=>i.type==='text'&&i.text.includes('file body')));
    const thread=calls.find(c=>c.method==='thread/start');assert.equal(thread.params.config['mcp_servers.secret.enabled'],false);assert.equal(thread.params.config['features.shell_tool'],false);
    rpc.emit('notification',{method:'item/agentMessage/delta',params:{threadId:'not-ours',turnId:'turn-1',delta:'private'}});
    rpc.emit('notification',{method:'item/agentMessage/delta',params:{threadId:'own-thread',turnId:'turn-1',itemId:'i1',delta:'你'}});
    rpc.emit('notification',{method:'item/agentMessage/delta',params:{threadId:'own-thread',turnId:'turn-1',itemId:'i1',delta:'好'}});
    rpc.emit('notification',{method:'item/completed',params:{threadId:'own-thread',turnId:'turn-1',item:{id:'i1',type:'agentMessage',text:'你好'}}});
    assert.equal(client.messages.at(-1).text,'你好');await client.cancel();assert.ok(calls.some(c=>c.method==='turn/interrupt'));
    rpc.emit('notification',{method:'turn/completed',params:{threadId:'own-thread',turn:{id:'turn-1',status:'completed'}}});assert.equal(client.busy,false);
    assert.equal(client.reset(),true);assert.equal(client.messages.length,0);
    assert.equal((await client.send('',undefined,[{name:'image.png',input:{type:'image',url:'data:image/png;base64,AAAA'}}])).direct,true);
    assert.equal(CHAT_METHODS.has('command/exec'),false);assert.equal(conversationConfig()['features.plugins'],false);
  }finally{await client.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
