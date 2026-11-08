'use strict';
const readline=require('node:readline'),crypto=require('node:crypto');
const {requestPresence,registryPath}=require('./bridge.cjs');
function run({input=process.stdin,output=process.stdout,file=registryPath()}={}){
  const clientId=crypto.randomUUID();let timer,initialized=false;
  const send=value=>output.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n');
  const pulse=()=>requestPresence(file,clientId);
  const lines=readline.createInterface({input});
  lines.on('line',async line=>{
    if(line.length>65536)return;let msg;try{msg=JSON.parse(line);}catch{return;}
    try{
      if(msg.method==='initialize'){
        initialized=true;clearInterval(timer);timer=setInterval(pulse,4000);await pulse();
        send({id:msg.id,result:{protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'shadowcyrene-bridge',version:require('../package.json').version}}});
      }else if(msg.method==='tools/list')send({id:msg.id,result:{tools:[{name:'companion_status',description:'Check whether the local ShadowCyrene desktop companion is running and renew the connection presence. Does not read chats or send messages.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}]}});
      else if(msg.method==='tools/call'&&msg.params?.name==='companion_status')send({id:msg.id,result:{content:[{type:'text',text:JSON.stringify(await pulse())}]}});
      else if(msg.method==='ping')send({id:msg.id,result:{}});
      else if(msg.id!==undefined)send({id:msg.id,error:{code:-32601,message:'Method not found'}});
    }catch{if(msg.id!==undefined)send({id:msg.id,error:{code:-32603,message:'Local companion unavailable'}});}
  });
  lines.on('close',async()=>{clearInterval(timer);if(initialized)await requestPresence(file,clientId,false);process.exit(0);});
}
module.exports={run};
