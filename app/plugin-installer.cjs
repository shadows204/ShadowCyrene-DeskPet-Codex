'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');const run=promisify(execFile);
async function installBridge({directory,executable,cli,developmentRoot}){
  const root=path.join(directory,'shadowcyrene-marketplace'),plugin=path.join(root,'plugins/shadowcyrene-bridge');
  fs.mkdirSync(path.join(root,'.agents/plugins'),{recursive:true});fs.mkdirSync(path.join(plugin,'.codex-plugin'),{recursive:true});
  const manifest={name:'shadowcyrene-bridge',version:require('../package.json').version,description:'Detect and connect to the local ShadowCyrene desktop pet. Does not read chats or send messages.',author:{name:'shadows204'},mcpServers:'./.mcp.json',interface:{displayName:'ShadowCyrene',shortDescription:'Local ShadowCyrene connection',category:'Productivity'}};
  fs.writeFileSync(path.join(plugin,'.codex-plugin/plugin.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(plugin,'.mcp.json'),JSON.stringify({mcpServers:{'shadowcyrene-bridge':{command:executable,args:[...(developmentRoot?[developmentRoot]:[]),'--bridge-mcp'],startup_timeout_sec:15,tool_timeout_sec:10}}},null,2));
  fs.writeFileSync(path.join(root,'.agents/plugins/marketplace.json'),JSON.stringify({name:'shadowcyrene-local',interface:{displayName:'ShadowCyrene'},plugins:[{name:manifest.name,source:{source:'local',path:'./plugins/shadowcyrene-bridge'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'}}]},null,2));
  await run(cli,['plugin','marketplace','add',root,'--json'],{windowsHide:true,timeout:25000,maxBuffer:1000000});
  await run(cli,['plugin','add','shadowcyrene-bridge@shadowcyrene-local','--json'],{windowsHide:true,timeout:30000,maxBuffer:1000000});
  return {installed:true,marketplace:root,plugin:'shadowcyrene-bridge@shadowcyrene-local'};
}
module.exports={installBridge};
