'use strict';
const fs=require('node:fs'),path=require('node:path');
async function run({win,state,settings,broadcast,setAnchor,qaOutput}){
  fs.mkdirSync(qaOutput,{recursive:true});const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await win.webContents.executeJavaScript('new Promise(r=>{const check=()=>window.shadowcyreneQA?.ready()?r():setTimeout(check,30);check();})');
  const evalJS=code=>win.webContents.executeJavaScript(code),hintHidden=()=>evalJS('document.getElementById("hint").hidden');
  settings.chat=true;settings.chatCollapsed=false;state.qa=true;state.appRunning=true;state.pluginConnected=true;state.connected=true;broadcast();await wait(200);
  await evalJS('document.getElementById("prompt").focus()');const r={};r.directHasNoPasteHint=await hintHidden();
  state.pluginConnected=false;broadcast();await wait(100);r.runningWithoutPluginHasNoPasteHint=await hintHidden();
  state.appRunning=false;broadcast();await wait(100);r.closedGPTShowsPasteHint=!(await hintHidden());
  state.appRunning=null;broadcast();await wait(100);r.unknownGPTStateHasNoPasteHint=await hintHidden();
  state.appRunning=true;state.pluginConnected=true;broadcast();await wait(100);
  await evalJS(`document.getElementById('prompt').value='未发送的草稿';document.getElementById('prompt').dispatchEvent(new Event('input'));document.getElementById('collapse-chat').click()`);await wait(150);
  r.collapsed=await evalJS(`(()=>{const b=document.getElementById('chat-orb'),q=b.getBoundingClientRect();return{orbVisible:!b.hidden,barHidden:document.getElementById('composer').hidden,hintHidden:document.getElementById('hint').hidden,width:q.width,height:q.height,draft:document.getElementById('prompt').value};})()`);
  fs.writeFileSync(path.join(qaOutput,'chat-collapsed.png'),(await win.webContents.capturePage()).toPNG());
  await evalJS(`document.getElementById('chat-orb').click()`);await wait(150);
  r.expanded=await evalJS(`({barVisible:!document.getElementById('composer').hidden,orbHidden:document.getElementById('chat-orb').hidden,focused:document.activeElement===document.getElementById('prompt'),draft:document.getElementById('prompt').value})`);
  const area=win.getBounds();setAnchor({x:area.x+area.width,y:area.y+area.height});state.appRunning=false;state.pluginConnected=false;broadcast();await wait(150);
  await evalJS('document.getElementById("prompt").focus()');
  r.offlineHintAvoidsBar=await evalJS(`(()=>{const a=document.getElementById('composer').getBoundingClientRect(),b=document.getElementById('hint').getBoundingClientRect();return b.bottom<=a.top||b.top>=a.bottom;})()`);
  state.appRunning=true;state.pluginConnected=true;broadcast();await wait(100);
  await evalJS(`document.getElementById('prompt').value='';document.getElementById('prompt').dispatchEvent(new Event('input'))`);await wait(100);
  fs.writeFileSync(path.join(qaOutput,'chat-expanded.png'),(await win.webContents.capturePage()).toPNG());
  await evalJS('document.getElementById("collapse-chat").click()');await wait(100);
  r.cornerCircleInside=await evalJS(`(()=>{const q=document.getElementById('chat-orb').getBoundingClientRect();return q.left>=0&&q.top>=0&&q.right<=innerWidth&&q.bottom<=innerHeight&&Math.abs(q.width-q.height)<.1;})()`);
  r.passed=r.directHasNoPasteHint&&r.runningWithoutPluginHasNoPasteHint&&r.closedGPTShowsPasteHint&&r.unknownGPTStateHasNoPasteHint&&r.collapsed.orbVisible&&r.collapsed.barHidden&&r.collapsed.hintHidden&&r.collapsed.draft==='未发送的草稿'&&r.expanded.barVisible&&r.expanded.orbHidden&&r.expanded.focused&&r.expanded.draft==='未发送的草稿'&&r.offlineHintAvoidsBar&&r.cornerCircleInside;
  fs.writeFileSync(path.join(qaOutput,'compact-chat-report.json'),JSON.stringify(r,null,2));if(!r.passed)throw Error('Compact Chat QA failed');
}
module.exports={run};
