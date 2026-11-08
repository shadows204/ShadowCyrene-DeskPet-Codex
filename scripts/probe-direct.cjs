'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {QuotaClient}=require('../app/quota-client.cjs');const {ChatClient}=require('../app/chat-client.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shadowcyrene-direct-check-'));
const cli=process.env.SHADOWCYRENE_CLI||'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const client=new ChatClient(cli,{directory,rpcFactory:(...args)=>{
  const rpc=new QuotaClient(...args),original=rpc.call.bind(rpc);
  rpc.call=(method,params)=>original(method,method==='thread/start'?{...params,ephemeral:true}:method==='turn/start'?{...params,effort:'low'}:params);return rpc;
}});
(async()=>{
  try{
    await client.start();const report={authenticated:client.ready,models:client.models.length,toolsDisabled:client.overrides['features.shell_tool']===false};
    if(process.argv.includes('--generate')){
      let observed=0;client.on('change',()=>{if(client.messages.at(-1)?.text)observed++;});
      const accepted=await client.send('只回复“连接成功”，不要使用任何工具。');
      const until=Date.now()+45000;while(client.busy&&Date.now()<until)await new Promise(r=>setTimeout(r,100));
      report.accepted=accepted.ok;report.completed=!client.busy&&!client.error;report.reply=client.messages.at(-1)?.text||'';report.streamUpdates=observed;
      if(!report.completed)process.exitCode=1;
    }
    fs.writeFileSync(path.join(__dirname,'../qa/direct-chat-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }catch(e){console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
  finally{await client.stop();fs.rmSync(directory,{recursive:true,force:true});}
})();
