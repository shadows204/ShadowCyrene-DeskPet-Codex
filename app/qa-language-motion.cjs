'use strict';
const fs=require('node:fs'),path=require('node:path');
const I18n=require('./i18n.cjs'),{quotaView}=require('./core.cjs');
async function run({win,state,settings,broadcast,setAnchor,qaOutput,menuSnapshot,chooseLanguage,settingsFile}){
  fs.mkdirSync(qaOutput,{recursive:true});const wait=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>win.webContents.executeJavaScript(code);
  await js('new Promise(r=>{const check=()=>window.shadowcyreneQA?.ready()?r():setTimeout(check,30);check();})');
  state.qa=true;state.appRunning=true;state.pluginConnected=true;state.connected=true;state.updatedAt=Date.now();
  state.quota=quotaView({rateLimits:{limitId:'codex',planType:'plus',primary:{usedPercent:25,windowDurationMins:300,resetsAt:Date.now()/1000+3600},secondary:{usedPercent:31,windowDurationMins:10080,resetsAt:Date.now()/1000+86400}}});
  const original='聊天原文保持不变 / Keep the original message';state.chatState={busy:false,messages:[{role:'assistant',id:'a1',text:original}]};
  settings.chat=true;settings.chatCollapsed=false;settings.messageMode='single';settings.reducedMotion=false;
  const area=win.getBounds();setAnchor({x:area.x+area.width/2-96,y:area.y+area.height/2-104});
  const report={languages:[]};
  const labels=items=>items.flatMap(i=>i.label==='Language / 语言'?[]:[i.label||'',...labels(i.submenu||[])]);
  for(const language of I18n.languages){
    chooseLanguage(language.id);await wait(300);await js('window.shadowcyreneQA.showBubble()');await wait(180);
    const dom=await js(`(()=>{const q=document.getElementById('quota');return{lang:document.documentElement.lang,placeholder:document.getElementById('prompt').placeholder,quota:q.textContent,quotaFits:q.scrollWidth<=q.clientWidth+1,originalPreserved:document.getElementById('message-content').textContent.includes(${JSON.stringify(original)})};})()`);
    const menuLabels=labels(menuSnapshot());const foreignMenuTranslated=!['en','fr'].includes(language.id)||menuLabels.every(s=>!/[\u3400-\u9fff]/.test(s));
    const persisted=JSON.parse(fs.readFileSync(settingsFile,'utf8')).language===language.id;
    const brandConsistent=win.getTitle()==='ShadowCyrene'&&menuSnapshot()[0].label==='ShadowCyrene'&&await js("document.title==='ShadowCyrene'&&document.getElementById('message-title').textContent.startsWith('ShadowCyrene')");
    report.languages.push({id:language.id,...dom,foreignMenuTranslated,persisted,brandConsistent});
    await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    fs.writeFileSync(path.join(qaOutput,`language-${language.id}.png`),(await win.webContents.capturePage()).toPNG());
  }
  chooseLanguage('zh-CN');settings.messageMode='off';broadcast();await js('window.shadowcyreneQA.resetBubble()');await wait(120);
  await js('window.shadowcyreneQA.drag(true,90,0)');await wait(400);report.slow=await js('window.shadowcyreneQA.runPose()');
  await js('window.shadowcyreneQA.drag(true,380,0)');await wait(400);report.fast=await js('window.shadowcyreneQA.runPose()');
  await js('window.shadowcyreneQA.drag(true,-380,0)');await wait(60);report.left=await js('window.shadowcyreneQA.runPose()');
  const dir=path.join(qaOutput,'drag-run-frames');fs.mkdirSync(dir,{recursive:true});
  for(const[side,vx]of[['right',220],['left',-220]]){
    await js(`window.shadowcyreneQA.drag(true,${vx},0)`);await wait(200);
    for(let i=0;i<16;i++){await wait(65);const p=state.layout.pet;fs.writeFileSync(path.join(dir,`${side}-${String(i).padStart(2,'0')}.png`),(await win.webContents.capturePage({x:Math.round(p.x),y:Math.round(p.y),width:Math.round(p.width),height:Math.round(p.height)})).toPNG());}
  }
  await js('window.shadowcyreneQA.drag(true,0,0)');await wait(650);report.heldStill=await js('window.shadowcyreneQA.runPose()');
  await js('window.shadowcyreneQA.drag(true,250,0)');await wait(200);await js('window.shadowcyreneQA.drag(false)');await wait(70);report.released=await js('window.shadowcyreneQA.runPose()');
  const {nativeImage}=require('electron');report.icons={};
  for(const name of ['tray.png','tray-win.png']){const icon=nativeImage.createFromPath(path.join(__dirname,'../Resources',name)),size=icon.getSize(),bitmap=icon.toBitmap();let visible=0;for(let i=3;i<bitmap.length;i+=4)if(bitmap[i]>12)visible++;report.icons[name]={size,scaleFactors:icon.getScaleFactors(),visibleFraction:visible/(bitmap.length/4)};}
  report.passed=report.languages.every(l=>l.lang===l.id&&l.foreignMenuTranslated&&l.persisted&&l.quotaFits&&l.originalPreserved&&l.brandConsistent)&&Object.values(report.icons).every(i=>i.visibleFraction>.6&&i.scaleFactors.includes(2))&&report.slow.row===1&&report.fast.fps>report.slow.fps&&report.fast.fps<=18&&report.left.row===2&&!report.heldStill.running&&!report.released.running&&report.released.key==='0:0';
  fs.writeFileSync(path.join(qaOutput,'language-motion-report.json'),JSON.stringify(report,null,2));if(!report.passed)throw Error('Language/motion QA failed');
}
module.exports={run};
