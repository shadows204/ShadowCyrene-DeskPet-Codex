'use strict';
const fs=require('node:fs'),path=require('node:path');
async function run({win,state,settings,broadcast,setAnchor,qaOutput,chooseLanguage,attachments,attachmentUpdate,readQASubmission}){
  fs.mkdirSync(qaOutput,{recursive:true});const js=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=condition=>js(`new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>(${condition})?resolve(true):Date.now()>deadline?reject(Error('Attachment UI timed out')):setTimeout(check,25);check();})`);
  await until('window.shadowcyreneQA?.ready()');
  state.qa=true;state.appRunning=true;state.pluginConnected=true;state.connected=true;settings.theme='light';settings.chat=true;settings.chatCollapsed=false;settings.messageMode='off';settings.bubble=false;broadcast();
  const bounds=win.getBounds();setAnchor({x:bounds.x+bounds.width/2-96,y:bounds.y+bounds.height/2-160});await wait(150);
  const report={simulated:true};
  const preview=fs.readFileSync(path.join(__dirname,'../Resources/tray@2x.png')).toString('base64');
  await js(`(()=>{document.getElementById('prompt').value='请看看图片和文件内容。';document.getElementById('prompt').dispatchEvent(new Event('input'));const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(${JSON.stringify(preview)}),c=>c.charCodeAt(0))],'clipboard-image.png',{type:'image/png'}));document.getElementById('prompt').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));})()`);
  await until('window.shadowcyreneQA.adding()===0&&window.shadowcyreneQA.attachments().length===1');
  report.imagePaste=await js("document.querySelector('.attachment-chip img').complete&&document.querySelector('.attachment-chip img').naturalWidth>0");
  await js(`(()=>{const d=new DataTransfer();d.items.add(new File(['ShadowCyrene dropped text fixture.'],'notes.txt',{type:'text/plain'}));document.getElementById('composer').dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}));})()`);
  await until('window.shadowcyreneQA.adding()===0&&window.shadowcyreneQA.attachments().length===2');report.dropText=true;
  const fixtures=process.env.SHADOWCYRENE_QA_FIXTURES||path.join(__dirname,'../Tests/fixtures');
  await attachments.addPath(path.join(fixtures,'sample.pdf'));await attachments.addPath(path.join(fixtures,'sample.docx'));attachmentUpdate();
  await until('window.shadowcyreneQA.attachments().length===4');report.documentKinds=attachments.snapshot().map(a=>a.kind);
  report.notSentOnAdd=readQASubmission()===undefined;
  report.locales=[];for(const id of ['zh-CN','zh-TW','en','fr','ja']){chooseLanguage(id);await wait(100);report.locales.push({id,plus:await js("document.getElementById('options').title"),removeLabel:await js("document.querySelector('.attachment-remove').getAttribute('aria-label')")});}
  chooseLanguage('zh-CN');
  await js("document.getElementById('collapse-chat').click()");await wait(120);
  report.collapsedKeepsFiles=await js("document.getElementById('composer').hidden&&window.shadowcyreneQA.attachments().length===4");
  await js("document.getElementById('chat-orb').click()");await wait(120);
  report.expandedKeepsDraft=await js("!document.getElementById('composer').hidden&&document.getElementById('prompt').value==='请看看图片和文件内容。'&&window.shadowcyreneQA.attachments().length===4");
  report.corners=[];for(const scale of [.5,1,2])for(const [x,y]of [[0,0],[bounds.width,0],[0,bounds.height],[bounds.width,bounds.height]]){
    settings.scale=scale;setAnchor({x:bounds.x+x,y:bounds.y+y});await wait(80);
    report.corners.push({scale,inside:await js("(()=>{const r=document.getElementById('composer').getBoundingClientRect(),a=document.getElementById('attachment-list').getBoundingClientRect(),b=document.getElementById('composer-row').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&a.bottom<=b.top+1;})()")});
  }
  settings.scale=1;setAnchor({x:bounds.x+bounds.width/2-96,y:bounds.y+bounds.height/2-160});await wait(120);
  await attachments.addBuffer({name:'remove-me.txt',bytes:Buffer.from('temporary fixture')});attachmentUpdate();await until('window.shadowcyreneQA.attachments().length===5');
  await js("document.querySelector('.attachment-chip:last-child .attachment-remove').click()");await until('window.shadowcyreneQA.attachments().length===4');report.removeWorks=true;
  state.pluginConnected=false;broadcast();await js('window.shadowcyreneQA.submit()');await wait(100);
  report.offlineKeepsDraft=await js("document.getElementById('prompt').value==='请看看图片和文件内容。'&&window.shadowcyreneQA.attachments().length===4");report.offlineDidNotSend=readQASubmission()===undefined;
  state.pluginConnected=true;broadcast();await wait(100);
  await js("document.getElementById('hint').hidden=true;document.body.style.background='linear-gradient(135deg,#e9e5f5,#fae8f1)' ");
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(100);
  const p=state.layout.pet,c=state.layout.chat,left=Math.max(0,Math.floor(Math.min(p.x,c.x)-24)),top=Math.max(0,Math.floor(Math.min(p.y,c.y)-24));
  fs.writeFileSync(path.join(qaOutput,'attachments-preview.png'),(await win.webContents.capturePage({x:left,y:top,width:Math.ceil(Math.max(p.x+p.width,c.x+c.width)+24-left),height:Math.ceil(Math.max(p.y+p.height,c.y+c.height)+24-top)})).toPNG());
  await js('window.shadowcyreneQA.submit()');await until('window.shadowcyreneQA.attachments().length===0');
  const submission=readQASubmission();report.sentTypes=submission.input.map(i=>i.type);report.trueImageInput=submission.input.some(i=>i.type==='image'&&i.dataURL);report.documentBodiesIncluded=submission.input.some(i=>i.text?.includes('ShadowCyrene PDF'))&&submission.input.some(i=>i.text?.includes('中文正文'));
  report.acceptedClearsDraft=await js("document.getElementById('prompt').value===''&&document.getElementById('attachment-list').hidden");
  report.passed=report.imagePaste&&report.dropText&&report.notSentOnAdd&&report.collapsedKeepsFiles&&report.expandedKeepsDraft&&report.corners.every(c=>c.inside)&&report.removeWorks&&report.offlineKeepsDraft&&report.offlineDidNotSend&&report.trueImageInput&&report.documentBodiesIncluded&&report.acceptedClearsDraft&&report.locales.every(l=>l.plus&&l.removeLabel);
  fs.writeFileSync(path.join(qaOutput,'attachments-report.json'),JSON.stringify(report,null,2));if(!report.passed)throw Error('Attachment QA failed');
}
module.exports={run};
