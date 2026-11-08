'use strict';
const fs=require('node:fs'),path=require('node:path');
async function run({win,screen,state,settings,broadcast,anchor,setAnchor,qaOutput}){
  fs.mkdirSync(qaOutput,{recursive:true});const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await win.webContents.executeJavaScript('new Promise((resolve,reject)=>{const until=Date.now()+10000;const check=()=>window.shadowcyreneQA?.ready()?resolve(true):Date.now()>until?reject(Error("Pet loading timeout")):setTimeout(check,30);check();})');
  state.qa=true;state.appRunning=true;state.connected=true;state.pluginConnected=true;state.updatedAt=Date.now();
  state.quota=require('./core.cjs').quotaView({rateLimits:{limitId:'codex',planType:'plus',primary:{usedPercent:32,windowDurationMins:300},secondary:{usedPercent:61,windowDurationMins:10080}}});
  state.chatState={busy:false,messages:[{id:'u1',role:'user',text:'今天想听ShadowCyrene说几句。'},{id:'a1',role:'assistant',text:'第一行：午后的风轻轻掠过。\n第二行：愿你的心情也变得轻盈。\n第三行：忙碌时也别忘了休息。\n第四行：我们可以慢慢来。\n第五行：先做好眼前的小事。\n第六行：我会在这里陪着你。\n第七行：把新的故事写下去吧。\n第八行：今天也请多多关照。'}]};
  settings.messageMode='multi';settings.messageLines=6;settings.theme='light';
  const area=win.getBounds(),w=area.width,h=area.height;
  const report={scenes:[]};
  for(const[name,x,y,scale]of[['left',300,200,1],['right',w-492,200,1],['bottom-left',0,h,1],['bottom-right',w,h,1],['top-left',0,0,1],['scaled-right',w,h,1.5]]){
    settings.scale=scale;setAnchor({x:area.x+x,y:area.y+y});broadcast();await wait(100);
    await win.webContents.executeJavaScript('window.shadowcyreneQA.showBubble()');await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(150);
    const actual=await win.webContents.executeJavaScript(`(()=>{const ids=['pet','composer','quota','messages'];return ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,x:r.x,y:r.y,width:r.width,height:r.height,visible:!document.getElementById(id).hidden};});})()`);
    report.scenes.push({name,layout:state.layout,actual,allVisibleInside:actual.filter(r=>r.visible).every(r=>r.x>=-.1&&r.y>=-.1&&r.x+r.width<=w+.1&&r.y+r.height<=h+.1)});
    fs.writeFileSync(path.join(qaOutput,`layout-${name}.png`),(await win.webContents.capturePage()).toPNG());
  }
  settings.scale=1;settings.messageMode='single';setAnchor({x:area.x+w-492,y:area.y+220});broadcast();await wait(200);
  fs.writeFileSync(path.join(qaOutput,'single-line.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript('window.shadowcyreneQA.resetBubble()');
  const p=state.layout.pet;win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(p.x+p.width/2),y:Math.round(p.y+p.height/2),button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(p.x+p.width/2),y:Math.round(p.y+p.height/2),button:'left',clickCount:1});await wait(100);
  report.actualClickShowsBubble=await win.webContents.executeJavaScript('window.shadowcyreneQA.bubbleVisible()');await wait(3100);report.expiresAfter3Seconds=!(await win.webContents.executeJavaScript('window.shadowcyreneQA.bubbleVisible()'));
  report.messagesTextOnly=await win.webContents.executeJavaScript(`(()=>{window.shadowcyreneQA.configure({chatState:{busy:false,messages:[{role:'assistant',text:'<img src=x onerror=alert(1)>',id:'test'}]}});return !document.querySelector('#message-content img')&&document.getElementById('message-content').textContent.includes('<img');})()`);
  report.allScenesInside=report.scenes.every(s=>s.allVisibleInside);
  fs.writeFileSync(path.join(qaOutput,'runtime-layout-report.json'),JSON.stringify(report,null,2));
}
module.exports={run};
