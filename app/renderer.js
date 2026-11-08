'use strict';
const {directionIndex,gazeTarget,smoothGaze,dragRunPose,blinkFrame}=window.ShadowCyreneCore;
const I18n=window.ShadowCyreneI18n;
const locale=()=>I18n.normalize(state.settings.language),T=(source,vars)=>I18n.t(source,locale(),vars);
const $=id=>document.getElementById(id);
const pet=$('pet'), atlas=new Image();
atlas.src='../Resources/atlas.png';
let state={settings:{gaze:'global'}},cursor={x:294,y:0,focused:false},direction=null;
let imageReady=false,current='0:0',previous=current,transitionAt=0,nextBlink=performance.now()+3500,blinkStart=null,animation=null;
let messageTimer,pressed=false,pressPoint=null,gestureMoved=false,frames=[],lastFrameTime=0,lastQuotaStamp='',puppet;
let head={x:0,y:0},eyes={x:0,y:0},bubbleUntil=0,bubbleTimer;
let face={x:294,y:122,scale:1},lastMessageStamp='',lastVisibility='',submitting=false;
let pendingAttachments=[],attachmentAdding=0,composerRowHeight=40;
let notice='',noticeIsPaste=false,focusAfterExpand=false;
let runPose=dragRunPose(),lastLocale='';
atlas.onload=()=>{try{puppet=new window.ShadowCyrenePuppet(pet,atlas);imageReady=true;}catch(e){showMessage(e.message);}};
function render(now) {
  requestAnimationFrame(render);
  if (!imageReady || document.hidden) return;
  const dt=lastFrameTime?now-lastFrameTime:16.7;
  if(lastFrameTime) {frames.push(dt);if(frames.length>600)frames.shift();}lastFrameTime=now;
  const settings=state.settings;
  const canLook=settings.gaze==='global'||(settings.gaze==='focused'&&cursor.focused);
  direction=canLook?directionIndex(cursor.x-face.x,cursor.y-face.y,direction):null;
  const target=canLook?gazeTarget((cursor.x-face.x)/face.scale,(cursor.y-face.y)/face.scale):{x:0,y:0};
  head=smoothGaze(head,target,dt,120);eyes=smoothGaze(eyes,target,dt,55);
  let key='0:0';
  const isDragging=!!cursor.drag?.active;
  runPose=dragRunPose(runPose,{...cursor.drag,scale:face.scale},dt);
  if(settings.reducedMotion){blinkStart=null;nextBlink=now+4000;}
  else if(!animation&&!isDragging) {
    if(now>=nextBlink&&blinkStart===null)blinkStart=now;
    if(blinkStart!==null){const col=blinkFrame(now-blinkStart);if(col!==null)key=`0:${col}`;else{blinkStart=null;nextBlink=now+3800+Math.random()*2400;}}
  }
  if(animation) {
    const elapsed=now-animation.start;
    const count={3:4,4:5,7:6,8:6}[animation.row]||4;
    const duration=animation.row===4?90:105;
    const index=Math.floor(elapsed/duration);
    if(index>=count){animation=null;nextBlink=now+3500;}else key=`${animation.row}:${index}`;
  }
  if(isDragging){animation=null;blinkStart=null;nextBlink=now+3500;if(runPose.running&&!settings.reducedMotion)key=`${runPose.row}:${runPose.column}`;}
  if(key!==current){previous=current;current=key;transitionAt=now;}
  const blend=state.settings.reducedMotion||runPose.running?1:Math.min(1,(now-transitionAt)/(blinkStart!==null?20:65));
  puppet.begin(animation||runPose.running?{x:0,y:0}:head,runPose.running?{x:0,y:0}:eyes);
  if(blend<1&&previous!==current)puppet.draw(previous,1-blend);
  puppet.draw(current,blend);
}
function resetDescription(value){
  if(!value?.resetsAt)return T('重置时间未提供');
  const d=new Date(value.resetsAt*1000);
  return T('重置 {time}',{time:d.toLocaleString(locale(),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})});
}
function quotaLine(label,value,notApplicable=false){
  const row=document.createElement('div');row.className='quota-row';
  const heading=document.createElement('div');heading.className='quota-label';
  const name=document.createElement('span');name.textContent=label;
  const remaining=document.createElement('strong');remaining.textContent=value?T('剩余 {percent}%',{percent:Math.round(value.remaining)}):T(notApplicable?'不适用':'未知');
  heading.append(name,remaining);row.append(heading);
  if(value){const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=`${value.remaining}%`;track.append(fill);row.append(track);}
  const reset=document.createElement('div');reset.className='reset';reset.textContent=value?resetDescription(value):T(notApplicable?'Pro 当前无此窗口限制':'服务端未提供该窗口');row.append(reset);return row;
}
function renderQuota(){
  const q=state.quota;
  $('plan').textContent=({plus:'Plus',pro:'Pro',unknown:T('未知套餐')})[q?.plan]||q?.plan||T('未连接');
  const key=JSON.stringify([q,state.updatedAt,state.connected,locale()]);
  if(key!==lastQuotaStamp){
    lastQuotaStamp=key;$('quota-lines').replaceChildren(
      quotaLine(T('5小时额度'),q?.fiveHour,q?.fiveHourNotApplicable),quotaLine(T('每周额度'),q?.weekly));
    for(const w of q?.extra||[])$('quota-lines').append(quotaLine(T('{n}分钟额度',{n:w.minutes}),w));
  }
  const stale=state.updatedAt&&Date.now()-state.updatedAt>125000;
  if(!state.connected||stale)$('status').textContent=state.updatedAt?T('旧数据 · {status} {time}',{status:T(state.error||'等待更新'),time:new Date(state.updatedAt).toLocaleTimeString(locale(), {hour:'2-digit',minute:'2-digit'})}):T(state.error||'等待连接');
  else $('status').textContent=T('已连接 · {time}',{time:new Date(state.updatedAt).toLocaleTimeString(locale(), {hour:'2-digit',minute:'2-digit',second:'2-digit'})});
  $('qa-label').hidden=!state.qa;
  $('quota').title=T('额度来源：{source}。{status}',{source:q?.name||'Codex / Work',status:T(state.error||'每60秒刷新，支持服务端变化通知。')});
}
function applyLocale(){
  const lang=locale();if(lang===lastLocale)return;lastLocale=lang;document.documentElement.lang=lang;document.title=T('ShadowCyrene');
  const text={ 'message-title':'ShadowCyrene · 对话','qa-label':'预览数据 · 非真实额度'};
  for(const[id,key]of Object.entries(text))$(id).textContent=T(key);
  const labels={stage:'ShadowCyrene桌面宠物',pet:'ShadowCyrene：拖动移动，右键打开菜单，双击挥手',quota:'Codex 与 Work 剩余额度',messages:'桌宠对话内容',composer:'Chat 输入栏',options:'添加文件或图片…','attachment-list':'待发送附件','collapse-chat':'收起 Chat','chat-orb':'展开 Chat',refresh:'刷新额度'};
  for(const[id,key]of Object.entries(labels)){$(id).setAttribute('aria-label',T(key));if(['options','collapse-chat','chat-orb','refresh'].includes(id))$(id).title=T(key);}
  $('prompt').placeholder=T('想聊些什么？');
}
function applyState(value){
  state={...state,...value};document.body.dataset.theme=state.theme||'light';document.body.dataset.reduced=String(!!state.settings.reducedMotion);
  applyLocale();
  updateBubble();$('composer').hidden=!state.settings.chat||!!state.settings.chatCollapsed;$('chat-orb').hidden=!state.settings.chat||!state.settings.chatCollapsed;
  if(Array.isArray(value.attachments))pendingAttachments=value.attachments;renderAttachments();
  renderQuota();renderMessages();applyLayout();updateChatMode();updateHint();
  requestAnimationFrame(()=>{reportRegions();if(focusAfterExpand&&!$('composer').hidden){focusAfterExpand=false;$('prompt').focus();}});
}
function applyLayout(){
  const layout=state.layout;if(!layout)return;
  for(const[id,key]of[['pet','pet'],['composer','chat'],['chat-orb','chat'],['quota','quota'],['messages','message']]){
    const r=layout[key],element=$(id);element.style.left=`${r.x}px`;element.style.top=`${r.y}px`;element.style.width=`${r.width/r.scale}px`;element.style.transform=`scale(${r.scale})`;
    if(id==='messages')element.style.height=`${r.height/r.scale}px`;
  }
  face={x:layout.pet.x+layout.pet.width/2,y:layout.pet.y+64*layout.pet.scale,scale:layout.pet.scale};
  const w=Math.round(layout.pet.width*devicePixelRatio),h=Math.round(layout.pet.height*devicePixelRatio);
  if(pet.width!==w||pet.height!==h){pet.width=w;pet.height=h;}
  $('hint').style.left=`${Math.max(6,Math.min(innerWidth-366,layout.chat.x+(layout.chat.width-360)/2))}px`;
  const below=layout.chat.y+layout.chat.height+5;
  $('hint').style.top=`${below+16<=innerHeight?below:Math.max(4,layout.chat.y-22)}px`;
}
function updateChatMode(){
  const busy=!!state.chatState?.busy||submitting;
  $('handoff').title=T(busy?'停止回复':state.directReady?'发送到桌宠专属会话':'复制文字并打开官方 Chat');
  $('handoff').setAttribute('aria-label',$('handoff').title);
  $('handoff').querySelector('path').setAttribute('d',busy?'M7 7h10v10H7z':state.directReady?'M12 19V5M6 11l6-6 6 6':'M7 17 17 7M7 7h10v10');
  $('composer').title=T(state.directReady?'配套插件已连接 · Codex/Work直发':'未连接配套插件 · 复制并打开官方 Chat');
  $('prompt').setAttribute('aria-label',T(state.directReady?'发送到桌宠专属会话':'输入后复制文字并打开官方 Chat'));
  $('options').disabled=submitting||attachmentAdding>0;$('handoff').disabled=submitting||attachmentAdding>0&&!busy;
}
function sizeComposer(){
  if(!$('composer').hidden){$('prompt').style.height='22px';$('prompt').style.height=Math.min(60,$('prompt').scrollHeight)+'px';composerRowHeight=Math.max(40,Math.min(76,$('prompt').scrollHeight+8));}
  const height=composerRowHeight+(pendingAttachments.length?64:0);$('composer').style.height=`${height}px`;window.companion.composerHeight(height);requestAnimationFrame(reportRegions);
}
function renderAttachments(){
  const list=$('attachment-list');list.replaceChildren();list.hidden=!pendingAttachments.length;
  for(const attachment of pendingAttachments){
    const chip=document.createElement('div');chip.className='attachment-chip';chip.setAttribute('role','listitem');chip.dataset.id=attachment.id;
    if(attachment.preview){const image=document.createElement('img');image.src=attachment.preview;image.alt=attachment.name;chip.append(image);}
    else{const symbol=document.createElement('span');symbol.className='attachment-symbol';symbol.textContent=attachment.kind==='text'?'TXT':attachment.kind.toUpperCase();chip.append(symbol);}
    const info=document.createElement('span');info.className='attachment-info';const name=document.createElement('span');name.className='attachment-name';name.textContent=attachment.name;
    const kind=document.createElement('span');kind.className='attachment-kind';const type=attachment.kind==='image'?T('图片'):['pdf','docx'].includes(attachment.kind)?T('仅正文'):T('文本');kind.textContent=`${type} · ${Math.max(1,Math.round(attachment.bytes/1024))} KB`;
    info.append(name,kind);chip.title=`${attachment.name}\n${T('待发送附件')} · ${kind.textContent}`;chip.append(info);
    const remove=document.createElement('button');remove.type='button';remove.className='attachment-remove';remove.textContent='×';remove.title=T('移除附件：{name}',{name:attachment.name});remove.setAttribute('aria-label',remove.title);remove.disabled=submitting;
    remove.addEventListener('click',async()=>{const result=await window.companion.removeAttachment(attachment.id);if(result?.error)showMessage(result.error);});chip.append(remove);list.append(chip);
  }
  sizeComposer();
}
async function importFiles(files){
  if(submitting)return;attachmentAdding++;updateChatMode();
  try{for(const file of files){
    if(file.size>10*1024*1024){showMessage('单个附件不能超过10MB。');continue;}
    const result=await window.companion.addAttachment({name:file.name||'pasted-image.png',bytes:new Uint8Array(await file.arrayBuffer())});
    if(result.error)showMessage(result.error);else if(/\.(pdf|docx)$/i.test(file.name))showMessage('PDF 和 DOCX 仅发送正文，不包含内嵌图片或原排版。');
  }}catch{showMessage('无法添加附件，请检查文件是否可读。');}
  finally{attachmentAdding--;updateChatMode();$('prompt').focus();}
}
function renderMessages(){
  const chat=state.chatState||{},entries=(chat.messages||[]).filter(m=>m.text),mode=state.settings.messageMode||'single';
  $('messages').hidden=mode==='off'||(!entries.length&&!chat.busy&&!chat.error);$('messages').dataset.mode=mode;
  $('chat-status').textContent=T(chat.busy?'回复中…':chat.error?'连接提示':'桌宠专属会话');
  const stamp=JSON.stringify([entries,mode,chat.error,chat.busy,locale()]);
  $('message-scroll').style.height=`${mode==='single'?20:(state.settings.messageLines||6)*20}px`;
  if(stamp!==lastMessageStamp){
    lastMessageStamp=stamp;const content=$('message-content');content.replaceChildren();
    if(mode==='single'){
      const latest=entries.at(-1);content.textContent=chat.error?T(chat.error):!latest&&chat.busy?T('正在连接…'):(latest?.text.split(/\r?\n/).filter(Boolean).at(-1)||'');
    }else{
      for(const m of entries.slice(-14)){const line=document.createElement('div');line.className='message-entry';line.dataset.role=m.role;line.textContent=`${T(m.role==='user'?'你':'ShadowCyrene')}${['zh-CN','zh-TW','ja'].includes(locale())?'：':': '}${m.text}`;content.append(line);}
      if(chat.error){const line=document.createElement('div');line.textContent=T(chat.error);content.append(line);}
      else if(chat.busy&&!entries.at(-1)?.text){const line=document.createElement('div');line.textContent=T('正在回复…');content.append(line);}
    }
    requestAnimationFrame(()=>{const scroll=$('message-scroll');scroll.scrollTop=scroll.scrollHeight;scroll.scrollLeft=scroll.scrollWidth;});
  }
}
function reportRegions(){
  const rects=[pet,...[$('quota'),$('composer'),$('chat-orb'),$('messages')].filter(e=>!e.hidden)].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
  window.companion.regions(rects);
  const visibility={bubble:!$('quota').hidden,messages:!$('messages').hidden};const key=JSON.stringify(visibility);
  if(lastVisibility!==key){lastVisibility=key;window.companion.visibility(visibility);}
}
function updateHint(){
  const pasteAllowed=state.appRunning===false&&!state.directReady;
  const transient=notice&&(!noticeIsPaste||pasteAllowed);
  $('hint').textContent=transient?T(notice):pasteAllowed?T('文字会复制到剪贴板，请在官方 Chat 粘贴发送'):'';
  $('hint').hidden=!state.settings.chat||!!state.settings.chatCollapsed||(!transient&&!pasteAllowed);
  document.body.dataset.message=String(!!transient);
}
function showMessage(text,pasteRelated=false){notice=text;noticeIsPaste=pasteRelated;clearTimeout(messageTimer);updateHint();messageTimer=setTimeout(()=>{notice='';updateHint();},6000);}
function updateBubble(){$('quota').hidden=!state.settings.bubble||performance.now()>=bubbleUntil;}
function showQuota(){
  if(!state.settings.bubble)return;
  bubbleUntil=performance.now()+3000;clearTimeout(bubbleTimer);updateBubble();reportRegions();
  bubbleTimer=setTimeout(()=>{updateBubble();reportRegions();},3000);
}
function trackGesture(e){if(pressed&&pressPoint&&(Math.hypot(e.screenX-pressPoint.x,e.screenY-pressPoint.y)>=5||Math.hypot(e.clientX-pressPoint.clientX,e.clientY-pressPoint.clientY)>=5))gestureMoved=true;}
pet.addEventListener('pointerdown',e=>{if(e.button!==0)return;pressed=true;gestureMoved=false;pressPoint={x:e.screenX,y:e.screenY,clientX:e.clientX,clientY:e.clientY};pet.setPointerCapture(e.pointerId);window.companion.drag('start');});
pet.addEventListener('pointermove',trackGesture);
pet.addEventListener('pointerup',e=>{if(pressed){trackGesture(e);pressed=false;window.companion.drag('end');if(pressPoint&&!gestureMoved)showQuota();pressPoint=null;}});
pet.addEventListener('lostpointercapture',()=>{if(pressed){pressed=false;window.companion.drag('end');}});
pet.addEventListener('dblclick',()=>{animation={row:3,start:performance.now()};});
pet.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showQuota();}if(e.key==='ContextMenu')window.companion.menu();});
document.addEventListener('contextmenu',e=>{if(e.target!==$('prompt')){e.preventDefault();window.companion.menu();}});
$('options').addEventListener('click',async()=>{const result=await window.companion.pickAttachments();if(result?.error)showMessage(result.error);});
$('refresh').addEventListener('click',()=>window.companion.refresh());
$('collapse-chat').addEventListener('click',()=>{$('prompt').blur();window.companion.collapseChat(true);});
$('chat-orb').addEventListener('click',()=>{focusAfterExpand=true;window.companion.collapseChat(false);});
async function submit(){
  if(submitting||attachmentAdding){if(attachmentAdding)showMessage('附件正在读取或消息正在提交，请稍候。');return;}
  if(state.chatState?.busy||submitting){await window.companion.cancel();return;}
  const text=$('prompt').value;
  submitting=true;updateChatMode();
  let result;try{result=await window.companion.openChat({text,attachmentIds:pendingAttachments.map(a=>a.id)});}catch{result={ok:false,error:'聊天连接失败，草稿未发送，请检查连接后重试。'};}finally{submitting=false;updateChatMode();}
  if(result.ok&&result.direct){$('prompt').value='';$('prompt').dispatchEvent(new Event('input'));}
  else showMessage(result.ok?(result.copied?'已复制，请在官方 Chat 粘贴发送':'已请求打开官方 Chat'):result.error||'暂时无法打开官方应用',!!(result.ok&&result.copied));
  // Keep the draft so a failed launch never loses the user's text.
}
$('composer').addEventListener('submit',e=>{e.preventDefault();submit();});
$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}if(e.key==='Escape')$('prompt').blur();});
$('prompt').addEventListener('input',sizeComposer);
$('prompt').addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])];if(!files.length)return;e.preventDefault();const text=e.clipboardData.getData('text/plain');if(text){$('prompt').setRangeText(text,$('prompt').selectionStart,$('prompt').selectionEnd,'end');$('prompt').dispatchEvent(new Event('input'));}importFiles(files);});
$('composer').addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();$('composer').dataset.dragover='true';}});
$('composer').addEventListener('dragleave',()=>delete $('composer').dataset.dragover);
$('composer').addEventListener('drop',e=>{e.preventDefault();delete $('composer').dataset.dragover;const files=[...(e.dataTransfer?.files||[])];if(files.length)importFiles(files);});
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target!==$('prompt'))window.companion.action('hide');});
window.companion.onState(applyState);
window.companion.onAttachments(value=>{pendingAttachments=value;renderAttachments();});
window.companion.onLayout(value=>{state.layout=value;applyLayout();reportRegions();});
window.companion.onCursor(value=>{cursor=value;});
window.companion.onAction(action=>{if(action==='focus'&&!$('composer').hidden)$('prompt').focus();if(action==='blur'&&pressed){pressed=false;window.companion.drag('end');}if(action==='drag-start'){animation=null;runPose=dragRunPose();cursor.drag={active:true,vx:0,vy:0};}if(action==='drag-end'){cursor.drag={active:false};runPose=dragRunPose(runPose,{active:false});}if(action?.animation)animation={row:action.animation,start:performance.now()};});
window.companion.ready().then(applyState);requestAnimationFrame(render);setInterval(renderQuota,10000);
new ResizeObserver(reportRegions).observe($('composer'));
window.addEventListener('resize',applyLayout);
window.shadowcyreneQA={configure:applyState,ready:()=>imageReady,showBubble:showQuota,direction:()=>direction,pose:()=>({head,eyes}),
  attachments:()=>pendingAttachments.map(a=>({id:a.id,name:a.name,kind:a.kind})),adding:()=>attachmentAdding,submit,
  drag:(active,vx=0,vy=0)=>{cursor.drag={active,vx,vy};},runPose:()=>({...runPose,key:current}),
  cursor:(x,y)=>{cursor={x,y,focused:false};},
  resetBubble:()=>{clearTimeout(bubbleTimer);bubbleUntil=0;updateBubble();reportRegions();},
  bubbleVisible:()=>!$('quota').hidden,
  async run(){
  const result={imageDecoded:imageReady,atlasSize:[atlas.naturalWidth,atlas.naturalHeight],screens:[],gaze:{},blinkMs:window.ShadowCyreneCore.BLINK_DURATIONS.reduce((a,b)=>a+b,0)};
  const original=cursor;
  for(const [name,x,y]of[['up',294,-500],['right',1000,122],['down',294,900],['left',-700,122]]){
    cursor={x,y,focused:false};await new Promise(r=>setTimeout(r,100));result.gaze[name]=direction;
  }
  result.continuousSweep=[];
  for(let x=220;x<=380;x+=10){cursor={x,y:80,focused:false};await new Promise(r=>setTimeout(r,35));result.continuousSweep.push({cursorX:x,headX:head.x,eyeX:eyes.x});}
  const originalSettings={...state.settings};
  applyState({...state,settings:{...originalSettings,gaze:'focused'}});cursor={x:1000,y:122,focused:false};await new Promise(r=>setTimeout(r,100));result.unfocusedInFocusMode=direction;
  cursor.focused=true;await new Promise(r=>setTimeout(r,100));result.focusedInFocusMode=direction;
  applyState({...state,settings:{...originalSettings,gaze:'off'}});await new Promise(r=>setTimeout(r,100));result.gazeOff=direction;
  applyState({...state,settings:{...originalSettings,bubble:false,chat:false}});result.togglesHide=[$('quota').hidden,$('composer').hidden];
  applyState({...state,settings:originalSettings});cursor=original;await new Promise(r=>setTimeout(r,150));
  bubbleUntil=0;updateBubble();result.bubbleDefaultHidden=$('quota').hidden;
  showQuota();result.bubbleVisibleOnClick=!$('quota').hidden;
  await new Promise(r=>setTimeout(r,1500));applyState(state);
  await new Promise(r=>setTimeout(r,1600));result.bubbleHiddenAfter3Seconds=$('quota').hidden;
  showQuota();
  result.frameIntervals={samples:frames.length,median:frames.toSorted((a,b)=>a-b)[Math.floor(frames.length/2)],p95:frames.toSorted((a,b)=>a-b)[Math.floor(frames.length*.95)]};
  for(const id of ['pet','quota','composer']){const r=$(id).getBoundingClientRect();result.screens.push({id,x:r.x,y:r.y,width:r.width,height:r.height,inside:r.left>=0&&r.top>=0&&r.right<=600&&r.bottom<=380});}
  return result;
}};
