'use strict';
const {app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, globalShortcut, clipboard, shell, dialog, nativeTheme, powerMonitor} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {QuotaClient} = require('./quota-client.cjs');
const {quotaView, clampPosition} = require('./core.cjs');
const {detectOfficialApp, findCLI, openOfficialApp} = require('./platform.cjs');
const {computeLayout}=require('./layout.cjs');
const {PresenceBridge}=require('./bridge.cjs');
const {ChatClient}=require('./chat-client.cjs');
const {installBridge}=require('./plugin-installer.cjs');
const I18n=require('./i18n.cjs');
const {migrateUserData,legacyDataName}=require('./migration.cjs');
const {AttachmentStore,AttachmentError,turnInput,stopDocumentReaders,EXTENSIONS,MAX_FILE_BYTES}=require('./attachments.cjs');
const attachments=new AttachmentStore({imageProcessor:bytes=>{
  const image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw new AttachmentError('图片无法读取，请改用 PNG、JPEG 或 WebP。');
  const size=image.getSize();if(size.width*size.height>24000000)throw new AttachmentError('图片分辨率过高，请缩小后添加。');
  let mime,data=bytes;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(bytes[0]===255&&bytes[1]===216)mime='image/jpeg';
  else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')mime='image/webp';
  else{mime='image/png';data=image.toPNG();}
  if(data.length>MAX_FILE_BYTES)throw new AttachmentError('转换后的图片超过10MB，请缩小后添加。');
  const fit=Math.min(64/size.width,64/size.height,1),preview=image.resize({width:Math.max(1,Math.round(size.width*fit)),height:Math.max(1,Math.round(size.height*fit))}).toDataURL();
  return{url:`data:${mime};base64,${data.toString('base64')}`,preview};
}});
let attachmentsLocked=false;
let qaLastSubmission;
const T=(source,vars)=>I18n.t(source,settings?.language,vars);
const QA = process.argv.includes('--qa');
const SMOKE = process.argv.includes('--smoke');
const qaOutput = process.env.SHADOWCYRENE_QA_OUTPUT || path.join(__dirname, '../qa');
const bridgeFile=process.env.SHADOWCYRENE_BRIDGE_FILE||(SMOKE?path.join(qaOutput,'bridge.json'):undefined);
app.setName('ShadowCyrene');
if (QA || SMOKE) app.setPath('userData', path.join(qaOutput, QA?'electron-qa-data':'electron-smoke-data'));
let display,anchor,composerHeight=40,presence,chatClient,chatBroadcastTimer;
let visibility={bubble:false,messages:false};
let win, tray, settings, settingsFile, client, regions = [], cursorTimer, statusTimer, refreshTimer, saving;
let dragging, ignore = false, watching = false, nextConnect = 0, connecting = false, quitting = false, hidden = false;
let state = {settings: {}, connected: false, appRunning: null, quota: null, updatedAt: null, error: '', shortcut: '', theme: 'light',pluginConnected:false,chatState:{messages:[],busy:false}};
const defaults = {language:'zh-CN',bubble: true, chat: true, chatCollapsed:false, gaze: 'global', reducedMotion: false, alwaysOnTop: true, theme: 'system', shortcut: 'Alt+Space', selectedBucket: 'codex',scale:1,petScale:1,chatScale:1,panelScale:1,messageMode:'single',messageLines:6};
function relayout(){
  if(!display||!anchor)return;
  const area=display.workArea;
  state.layout=computeLayout({width:area.width,height:area.height,anchor:{x:anchor.x-area.x,y:anchor.y-area.y},settings:{...settings,offlineHint:state.appRunning===false},composerHeight,...visibility});
  anchor={x:area.x+state.layout.pet.x,y:area.y+state.layout.pet.y};
}
function saveSettings() {
  clearTimeout(saving);
  saving = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(settingsFile), {recursive:true}); fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings, null, 2), {mode:0o600}); fs.renameSync(settingsFile + '.tmp', settingsFile); } catch {}
  }, 200);
}
function broadcast() {
  if(quitting)return;
  state.settings = {...settings};
  relayout();state.directReady=!!(state.pluginConnected&&state.appRunning===true&&state.connected);
  state.theme = settings.theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : settings.theme;
  if (win && !win.isDestroyed()) win.webContents.send('state', state);
  if (tray&&!tray.isDestroyed()){tray.setContextMenu(makeMenu());tray.setToolTip(T('ShadowCyrene'));}
  if(win&&!win.isDestroyed())win.setTitle(T('ShadowCyrene'));
}
function setSetting(name, value) {settings[name] = value; saveSettings(); broadcast();}
function show() {hidden = false;if(settings.chatCollapsed){settings.chatCollapsed=false;saveSettings();broadcast();}win.show(); win.setSkipTaskbar(true); win.focus(); win.webContents.send('action', 'focus');}
function toggle() {if (hidden || !win.isVisible()) show(); else {hidden = true; win.hide();}}
function registerHotkey() {
  globalShortcut.unregisterAll();
  const preferred = settings.shortcut;
  if (globalShortcut.register(preferred, show)) state.shortcut = preferred;
  else if (globalShortcut.register('Alt+Shift+Space', show)) state.shortcut = 'Alt+Shift+Space（原快捷键被占用）';
  else state.shortcut = '快捷键被占用，请通过菜单栏／托盘打开';
  broadcast();
}
function disconnect() {if (client) {const old=client; client=null; old.stop();} state.connected = false;}
async function connect() {
  if (connecting || client || Date.now() < nextConnect || QA) return;
  const cliPath = findCLI(settings, state.appPath);
  if (!cliPath) {state.error = '未找到官方 Codex CLI：右键 → 连接设置。'; broadcast(); return;}
  state.activeCLIPath=cliPath;
  connecting = true;
  const current = new QuotaClient(cliPath); client = current;
  current.on('diagnostic',value=>{state.diagnostic=value;});
  current.on('account', account => {state.plan = account.planType;});
  current.on('limits', payload => {
    if (client !== current) return;
    state.quota = quotaView(payload, state.plan, settings.selectedBucket);
    state.plan = state.quota.plan;
    state.updatedAt = Date.now(); state.connected = true; state.error = ''; broadcast();
  });
  current.on('offline', message => {
    if (client !== current) return;
    state.error = message; nextConnect = Date.now()+15000; disconnect(); broadcast();
  });
  try {await current.start();}
  catch (e) {if (client === current) {state.error = e.message; nextConnect=Date.now()+15000; disconnect(); broadcast();}}
  finally {connecting = false;}
}
async function watchApp() {
  if (watching || QA) return;
  watching = true;
  try {
    const detected = await detectOfficialApp({...settings,activeCLIPath:state.activeCLIPath});
    state.appRunning = detected.running; state.appPath = detected.appPath;
    broadcast();
    if(detected.appPath&&settings.discoveredAppPath!==detected.appPath){settings.discoveredAppPath=detected.appPath;saveSettings();}
    if (detected.running === true) await connect();
    else if (detected.running === false) {disconnect();if(chatClient){await chatClient.stop();chatClient=null;} state.error = '打开 ChatGPT／Codex 后自动连接。';}
    else state.error = '暂时无法检测官方应用，可从菜单手动连接。';
    broadcast();
  } finally {watching = false;}
}
async function refresh() {
  if (!client) {nextConnect=0; await connect(); return;}
  try {await client.refresh();} catch(e) {state.connected=false; state.error=e.message; broadcast();}
}
async function choosePath(kind) {
  const result = await dialog.showOpenDialog(win, {
    title:T(kind === 'cliPath' ? '选择官方 codex 可执行文件（Windows 选择 codex.exe）' : '选择 ChatGPT／Codex 应用'),
    properties: ['openFile'],
    ...(process.platform === 'win32' ? {filters:[{name:T('应用程序'),extensions:['exe']}]} : {})
  });
  if (!result.canceled && result.filePaths[0]) {
    setSetting(kind,result.filePaths[0]); disconnect(); nextConnect=0; await watchApp();
  }
}
function makeMenu() {
  const item = (label,name) => ({label,type:'checkbox',checked:settings[name],click:()=>setSetting(name,!settings[name])});
  const animate = (label, row) => ({label,click:()=>win.webContents.send('action',{animation:row})});
  const plan = state.quota?.plan || state.plan || T('未连接');
  const scaleMenu=key=>[.5,.75,1,1.25,1.5,2].map(value=>({label:`${value*100}%`,type:'radio',checked:settings[key]===value,click:()=>setSetting(key,value)}));
  return Menu.buildFromTemplate(I18n.menu([
    {label:'ShadowCyrene',enabled:false},
    {label:`Codex / Work · ${plan}`,enabled:false},
    {label:'Language / 语言',submenu:I18n.languages.map(l=>({label:l.name,type:'radio',checked:settings.language===l.id,click:()=>setSetting('language',l.id)}))},
    {type:'separator'},
    {label:'显示桌宠与 Chat',click:show},
    item('单击人物显示额度（3秒）','bubble'), item('显示 Chat 输入栏','chat'),
    {label:settings.chatCollapsed?'展开 Chat':'收起 Chat 为圆钮',click:()=>setSetting('chatCollapsed',!settings.chatCollapsed)},
    {label:'添加文件或图片…',click:pickAttachments},
    {label:state.directReady?'直发已连接 · 桌宠专属会话':'复制并打开官方 Chat',enabled:false},
    {label:'回复显示',submenu:[{label:'关闭',type:'radio',checked:settings.messageMode==='off',click:()=>setSetting('messageMode','off')},{label:'只显示最近一行',type:'radio',checked:settings.messageMode==='single',click:()=>setSetting('messageMode','single')},...[5,6,7].map(n=>({label:`${n}行 · 粉色渐隐`,type:'radio',checked:settings.messageMode==='multi'&&settings.messageLines===n,click:()=>{settings.messageLines=n;setSetting('messageMode','multi');}}))]},
    {label:'大小缩放',submenu:[{label:'整体',submenu:scaleMenu('scale')},{label:'人物',submenu:scaleMenu('petScale')},{label:'Chat输入栏',submenu:scaleMenu('chatScale')},{label:'消息与额度框',submenu:scaleMenu('panelScale')},{label:'恢复100%',click:()=>{for(const k of ['scale','petScale','chatScale','panelScale'])settings[k]=1;saveSettings();broadcast();}}]},
    {label:'桌宠会话',submenu:[{label:'新对话',enabled:!state.chatState.busy,click:()=>{chatClient?.reset();state.chatState={...state.chatState,messages:[],error:''};broadcast();}},{label:'停止回复',enabled:!!state.chatState.busy,click:()=>chatClient?.cancel()},
      {label:'模型',submenu:[{label:'使用官方默认',type:'radio',checked:!settings.chatModel,click:()=>setSetting('chatModel',null)},...(state.chatState.models||[]).map(m=>({label:m.displayName,type:'radio',checked:settings.chatModel===m.model,click:()=>setSetting('chatModel',m.model)}))]}]},
    {label:state.pluginConnected?'配套检测插件已连接':'安装／更新配套检测插件…',click:async()=>{
      const cli=findCLI(settings,state.appPath);if(!cli)return dialog.showErrorBox(T('未找到官方CLI'),T('请先在连接设置中选择官方 Codex CLI。'));
      try{await installBridge({directory:app.getPath('userData'),executable:process.execPath,cli,developmentRoot:app.isPackaged?null:path.join(__dirname,'..')});dialog.showMessageBox(win,{message:T('配套检测插件已安装'),detail:T('在官方应用中刷新插件，或下次启动新的会话后加载。检测插件实际连接后，Chat栏会自动切换直发。')});}catch{dialog.showErrorBox(T('插件安装未完成'),T('请查看使用说明中的手动安装步骤。已有桌宠仍可使用。'));}
    }},
    {label:'目光跟随',submenu:[
      {label:'始终跟随全局鼠标',type:'radio',checked:settings.gaze==='global',click:()=>setSetting('gaze','global')},
      {label:'仅桌宠窗口聚焦时',type:'radio',checked:settings.gaze==='focused',click:()=>setSetting('gaze','focused')},
      {label:'关闭',type:'radio',checked:settings.gaze==='off',click:()=>setSetting('gaze','off')}
    ]},
    item('减少动态效果','reducedMotion'),
    {label:'窗口始终置顶',type:'checkbox',checked:settings.alwaysOnTop,click:()=>{setSetting('alwaysOnTop',!settings.alwaysOnTop);win.setSkipTaskbar(true);win.setAlwaysOnTop(settings.alwaysOnTop,'floating');}},
    {label:'动作',submenu:[animate('挥手',3),animate('轻跳',4),animate('思考',7),animate('开心检查',8)]},
    {label:'外观',submenu:['system','light','dark'].map((theme,i)=>({label:['跟随系统','浅色','深色'][i],type:'radio',checked:settings.theme===theme,click:()=>setSetting('theme',theme)}))},
    {label:'额度来源',submenu:(state.quota?.ids || ['codex']).map(id=>({label:id,type:'radio',checked:(state.quota?.id || 'codex')===id,click:()=>{setSetting('selectedBucket',id);refresh();}}))},
    {label:'立即刷新额度',click:refresh},
    {label:'打开官方 ChatGPT／Codex',click:()=>openChat('')},
    {label:'连接设置',submenu:[
      {label:'选择官方应用…',click:()=>choosePath('appPath')},
      {label:'选择官方 Codex CLI…',click:()=>choosePath('cliPath')},
      {label:'重试额度连接',click:()=>{disconnect();nextConnect=0;connect();}},
      {label:'查看官方 CLI 登录说明',click:()=>shell.openExternal('https://learn.chatgpt.com/docs/cli')}
    ]},
    {label:'唤出快捷键',submenu:[
      {label:process.platform==='darwin'?'Option + Space':'Alt + Space',type:'radio',checked:settings.shortcut==='Alt+Space',click:()=>{settings.shortcut='Alt+Space';saveSettings();registerHotkey();}},
      {label:process.platform==='darwin'?'Option + Shift + Space':'Alt + Shift + Space',type:'radio',checked:settings.shortcut==='Alt+Shift+Space',click:()=>{settings.shortcut='Alt+Shift+Space';saveSettings();registerHotkey();}},
      {label:`当前：${state.shortcut}`,enabled:false}
    ]},
    {label:'重置人物位置',click:()=>{display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());win.setBounds(display.workArea);anchor={x:display.workArea.x+display.workArea.width-230,y:display.workArea.y+display.workArea.height-300};broadcast();}},
    {type:'separator'}, {label:'隐藏桌宠',click:()=>{hidden=true;win.hide();}}, {label:'退出ShadowCyrene',click:()=>app.quit()}
  ],settings.language));
}
function attachmentUpdate(error=''){
  const value=attachments.snapshot();win?.webContents.send('attachments',value);return{ok:!error,attachments:value,...(error?{error}:{})};
}
const attachmentError=e=>e instanceof AttachmentError?e.message:'无法添加附件，请检查文件是否可读。';
async function pickAttachments(){
  if(attachmentsLocked)return attachmentUpdate('正在提交消息，请稍候。');
  win.setIgnoreMouseEvents(false);ignore=false;
  const result=await dialog.showOpenDialog(win,{title:T('添加文件或图片…'),properties:['openFile','multiSelections'],filters:[{name:T('支持的附件'),extensions:EXTENSIONS}]});
  if(result.canceled)return attachmentUpdate();let error='';
  for(const file of result.filePaths){if(attachmentsLocked){error='正在提交消息，请稍候。';break;}try{await attachments.addPath(file);}catch(e){error=attachmentError(e);}}
  win.webContents.send('action','focus');return attachmentUpdate(error);
}
async function openChat(value) {
  const text=typeof value==='string'?value:value?.text,ids=typeof value==='string'?[]:value?.attachmentIds||[];
  if (typeof text !== 'string' || text.length > 100000) return {ok:false,error:'输入过长。'};
  let ownLock=false;
  try {
    if(attachmentsLocked||attachments.pendingCount)return{ok:false,error:'附件正在读取或消息正在提交，请稍候。'};
    const selected=attachments.resolve(ids);
    if(QA){
      if(!process.argv.includes('--qa-attachments'))return{ok:false,error:'预览模式不发送消息。'};
      if(!state.directReady)return{ok:false,error:'附件尚未发送。请连接直发，或在官方 Chat 中手动添加。'};
      qaLastSubmission={simulated:true,text,names:selected.map(a=>a.name),input:turnInput(text,selected).map(i=>({type:i.type,...(i.type==='text'?{text:i.text}:{dataURL:i.url.startsWith('data:image/')})}))};
      attachments.removeMany(ids);attachmentUpdate();return{ok:true,direct:true};
    }
    if((text.trim()||selected.length)&&state.directReady){
      attachmentsLocked=true;ownLock=true;
      if(!chatClient){chatClient=new ChatClient(findCLI(settings,state.appPath),{directory:path.join(app.getPath('userData'),'conversation')});chatClient.on('change',value=>{state.chatState=value;clearTimeout(chatBroadcastTimer);chatBroadcastTimer=setTimeout(broadcast,25);});}
      const result=await chatClient.send(text,settings.chatModel||undefined,selected);
      if(result.ok&&result.direct){attachments.removeMany(ids);attachmentUpdate();}return result;
    }
    if(selected.length){await openOfficialApp(settings,state,shell);setTimeout(watchApp,1500);return{ok:false,error:'附件尚未发送。请连接直发，或在官方 Chat 中手动添加。'};}
    // The user explicitly selected clipboard handoff; nothing is automatically pasted or sent.
    if (text.trim()) clipboard.writeText(text);
    await openOfficialApp(settings,state,shell);
    setTimeout(watchApp,1500);
    return {ok:true,copied:!!text.trim()};
  } catch(e) {return {ok:false,error:e.message};}
  finally{if(ownLock)attachmentsLocked=false;}
}
function verifySender(event) {return win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;}
function setupIPC() {
  ipcMain.handle('ready', e=>{if (!verifySender(e))return;return {...state,settings,platform:process.platform,attachments:attachments.snapshot()};});
  ipcMain.handle('attachments:pick',e=>verifySender(e)?pickAttachments():{ok:false});
  ipcMain.handle('attachments:add',async(e,value)=>{if(!verifySender(e))return{ok:false};if(attachmentsLocked)return attachmentUpdate('正在提交消息，请稍候。');try{await attachments.addBuffer(value);return attachmentUpdate();}catch(error){return attachmentUpdate(attachmentError(error));}});
  ipcMain.handle('attachments:remove',(e,id)=>{if(!verifySender(e)||attachmentsLocked||typeof id!=='string')return{ok:false};attachments.remove(id);return attachmentUpdate();});
  ipcMain.handle('refresh', async e=>{if(verifySender(e))await refresh();});
  ipcMain.handle('chat', (e,text)=>verifySender(e)?openChat(text):{ok:false});
  ipcMain.handle('cancel',async e=>{if(verifySender(e))await chatClient?.cancel();});
  ipcMain.on('chat-collapse',(e,value)=>{if(verifySender(e)&&typeof value==='boolean')setSetting('chatCollapsed',value);});
  ipcMain.on('visibility',(e,value)=>{if(!verifySender(e)||typeof value!=='object')return;const next={bubble:!!value.bubble,messages:!!value.messages};if(next.bubble!==visibility.bubble||next.messages!==visibility.messages){visibility=next;broadcast();}});
  ipcMain.on('composer-height',(e,value)=>{if(verifySender(e)&&Number.isFinite(value)){const next=Math.max(40,Math.min(140,value));if(next!==composerHeight){composerHeight=next;broadcast();}}});
  ipcMain.on('regions',(e,value)=>{if(verifySender(e)&&Array.isArray(value))regions=value.slice(0,16).filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite));});
  ipcMain.on('menu',e=>{if(verifySender(e)){win.setIgnoreMouseEvents(false);ignore=false;makeMenu().popup({window:win});}});
  ipcMain.on('command',(e,action)=>{if(!verifySender(e))return;if(action==='hide'){hidden=true;win.hide();}else if(action==='menu')makeMenu().popup({window:win});});
  ipcMain.on('drag',(e,value)=>{
    if(!verifySender(e))return;
    if(value?.phase==='start'){const p=screen.getCursorScreenPoint();dragging={origin:{...anchor},cursor:p,last:p,lastTime:performance.now()};win.webContents.send('action','drag-start');}
    if(value?.phase==='end'){if(dragging){const p=screen.getCursorScreenPoint();anchor={x:dragging.origin.x+p.x-dragging.cursor.x,y:dragging.origin.y+p.y-dragging.cursor.y};relayout();win.webContents.send('layout',state.layout);}dragging=null;win.webContents.send('action','drag-end');settings.petAnchor={...anchor};saveSettings();}
  });
}
function tickCursor() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const cursor=screen.getCursorScreenPoint();
  let motion={active:false,vx:0,vy:0};
  if (dragging) {
    const now=performance.now(),dt=Math.max(1,now-dragging.lastTime);
    motion={active:true,vx:(cursor.x-dragging.last.x)*1000/dt,vy:(cursor.y-dragging.last.y)*1000/dt};dragging.last=cursor;dragging.lastTime=now;
    const target={x:dragging.origin.x+cursor.x-dragging.cursor.x,y:dragging.origin.y+cursor.y-dragging.cursor.y};
    const d=screen.getDisplayNearestPoint(cursor);if(d.id!==display.id){display=d;win.setBounds(d.workArea);}anchor=target;relayout();win.webContents.send('layout',state.layout);
  }
  const [x,y]=win.getPosition();const local={x:cursor.x-x,y:cursor.y-y};
  const interactive=!!dragging||regions.some(r=>local.x>=r.x&&local.x<=r.x+r.width&&local.y>=r.y&&local.y<=r.y+r.height);
  if (ignore===interactive) {ignore=!interactive;win.setIgnoreMouseEvents(ignore,{forward:true});}
  win.webContents.send('cursor',{...local,focused:win.isFocused(),drag:motion});
}
async function runQA(){await require(process.argv.includes('--qa-attachments')?'./qa-attachments.cjs':process.argv.includes('--qa-language-motion')?'./qa-language-motion.cjs':process.argv.includes('--qa-compact')?'./qa-compact.cjs':'./qa-runner.cjs').run({win,screen,state,settings,broadcast,chooseLanguage:l=>setSetting('language',l),settingsFile,menuSnapshot:()=>{const walk=items=>items.map(i=>({label:i.label,checked:i.checked,submenu:i.submenu?walk(i.submenu.items):undefined}));return walk(makeMenu().items);},attachments,attachmentUpdate,readQASubmission:()=>qaLastSubmission,anchor:()=>anchor,setAnchor:p=>{anchor=p;broadcast();},qaOutput});app.quit();}
async function runSmoke(){
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const start=Date.now();
 const helper=require('node:child_process').spawn(process.execPath,[...(app.isPackaged?[]:[path.join(__dirname,'..')]),'--bridge-mcp'],{stdio:['pipe','pipe','ignore'],windowsHide:true,env:{...process.env,...(bridgeFile?{SHADOWCYRENE_BRIDGE_FILE:bridgeFile}:{})}});
 let mcpHandshake=false;helper.stdout.on('data',chunk=>{if(String(chunk).includes('shadowcyrene-bridge'))mcpHandshake=true;});
 helper.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'shadowcyrene-local-smoke',version:'1'}}})+'\n');
 while(!state.connected&&!state.diagnostic&&Date.now()-start<55000)await wait(200);
 await wait(1500);
 const report={appDetected:state.appRunning,connected:state.connected,plan:state.quota?.plan,fiveHourReceived:!!state.quota?.fiveHour,weeklyReceived:!!state.quota?.weekly,pluginConnected:state.pluginConnected,directReady:state.directReady,mcpExecutableHandshake:mcpHandshake,hostSimulation:true,shortcut:state.shortcut,windowVisible:win.isVisible(),layout:state.layout,diagnostic:state.diagnostic,error:state.error};
 helper.stdin.end();await wait(2000);report.pluginDisconnectFallsBack=!state.directReady;
 fs.mkdirSync(qaOutput,{recursive:true});fs.writeFileSync(path.join(qaOutput,'live-connection-report.json'),JSON.stringify(report,null,2));app.quit();
}
if (!QA && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(win)show();});
  app.whenReady().then(async()=>{
    if(!QA&&!SMOKE)migrateUserData(app.getPath('userData'),path.join(app.getPath('appData'),legacyDataName));
    settingsFile=path.join(app.getPath('userData'),'settings.json');
    let saved={};try{saved=JSON.parse(fs.readFileSync(settingsFile,'utf8'));}catch{}
    settings={...defaults,...saved};if(QA||SMOKE)settings={...defaults};settings.language=I18n.normalize(settings.language);
    if(!['system','dark','light'].includes(settings.theme))settings.theme='system';
    if(!['Alt+Space','Alt+Shift+Space'].includes(settings.shortcut))settings.shortcut='Alt+Space';
    display=screen.getPrimaryDisplay();
    anchor=settings.petAnchor||(settings.position?{x:settings.position.x+198,y:settings.position.y+58}:null)||{x:display.workArea.x+display.workArea.width-230,y:display.workArea.y+display.workArea.height-300};
    display=screen.getDisplayNearestPoint(anchor);relayout();
    win=new BrowserWindow({...display.workArea,frame:false,transparent:true,resizable:false,hasShadow:false,show:false,skipTaskbar:true,alwaysOnTop:settings.alwaysOnTop,
      title:'ShadowCyrene',icon:path.join(__dirname,'../Resources/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:true}});
    win.setAlwaysOnTop(settings.alwaysOnTop,'floating');
    win.setIgnoreMouseEvents(true,{forward:true});ignore=true;
    if(process.platform==='darwin') {win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});app.dock?.hide();}
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
    setupIPC();
    win.on('close',e=>{if(!quitting&&!QA){e.preventDefault();hidden=true;win.hide();}});
    win.on('minimize',()=>{hidden=true;win.hide();});
    win.on('show',()=>win.setSkipTaskbar(true));
    win.on('blur',()=>win.webContents.send('action','blur'));
    await win.loadFile(path.join(__dirname,'index.html'));
    win.showInactive();broadcast();
    if(!QA){
      const icon=nativeImage.createFromPath(path.join(__dirname,process.platform==='win32'?'../Resources/tray-win.png':'../Resources/tray.png'));
      tray=new Tray(icon);tray.setToolTip('ShadowCyrene');tray.setContextMenu(makeMenu());tray.on('double-click',show);if(process.platform==='win32')tray.on('click',toggle);
      registerHotkey();cursorTimer=setInterval(tickCursor,1000/60);statusTimer=setInterval(watchApp,5000);
      refreshTimer=setInterval(()=>{if(client)refresh();},60000);
      nativeTheme.on('updated',broadcast);powerMonitor.on('resume',()=>{disconnect();nextConnect=0;watchApp();});
      presence=new PresenceBridge({...(bridgeFile?{file:bridgeFile}:{}),onChange:active=>{state.pluginConnected=active;broadcast();}});
      try{await presence.start();}catch{state.error='本机插件连接服务未启动。';}
      screen.on('display-metrics-changed',()=>{display=screen.getDisplayNearestPoint(anchor);win.setBounds(display.workArea);broadcast();});
      screen.on('display-removed',()=>{display=screen.getDisplayNearestPoint(anchor);win.setBounds(display.workArea);broadcast();});
      watchApp();
      if(SMOKE)runSmoke();
    }else await runQA();
  });
}
app.on('before-quit',event=>{
  if(quitting)return;event.preventDefault();quitting=true;
  clearTimeout(chatBroadcastTimer);clearInterval(cursorTimer);clearInterval(statusTimer);clearInterval(refreshTimer);clearTimeout(saving);disconnect();attachments.clear();stopDocumentReaders();globalShortcut.unregisterAll();tray?.destroy();
  if(settings&&settingsFile&&!QA&&!SMOKE)try{settings.petAnchor=anchor;fs.mkdirSync(path.dirname(settingsFile),{recursive:true});fs.writeFileSync(settingsFile,JSON.stringify(settings,null,2),{mode:0o600});}catch{}
  Promise.allSettled([presence?.stop(),chatClient?.stop()]).then(()=>app.quit());
});
app.on('window-all-closed',()=>app.quit());
process.on('SIGTERM',()=>app.quit());
