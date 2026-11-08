'use strict';
const {EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {QuotaClient,METHODS}=require('./quota-client.cjs');
const CHAT_METHODS=new Set([...METHODS,'config/read','mcpServerStatus/list','model/list','thread/start','thread/resume','turn/start','turn/interrupt']);
function conversationConfig(config={}){
  const result={'features.shell_tool':false,'features.unified_exec':false,'features.apps':false,'features.plugins':false,'features.hooks':false,'web_search':'disabled'};
  for(const name of Object.keys(config.mcp_servers||{}))result[`mcp_servers.${name}.enabled`]=false;
  return result;
}
class ChatClient extends EventEmitter{
  constructor(executable,{directory,rpcFactory=(...args)=>new QuotaClient(...args)}={}){
    super();this.directory=directory;this.rpcFactory=rpcFactory;this.executable=executable;this.messages=[];this.models=[];this.busy=false;this.turn=null;this.threadId=null;this.closed=false;
  }
  snapshot(){return {messages:this.messages.slice(-60),busy:this.busy,models:this.models,error:this.error||'',ready:this.ready||false};}
  update(){this.emit('change',this.snapshot());}
  async start(){
    this.rpc?.stop();this.threadLoaded=false;
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    const args=[];for(const [key,value]of Object.entries(conversationConfig()))args.push('-c',`${key}=${JSON.stringify(value)}`);args.push('app-server');
    const rpc=this.rpcFactory(this.executable,{methods:CHAT_METHODS,args,timeout:22000});this.rpc=rpc;
    rpc.on('notification',msg=>this.onEvent(msg));
    rpc.on('offline',()=>{this.ready=false;if(this.busy){this.busy=false;this.error='聊天连接断开；消息不会自动重发。';}this.update();});
    await rpc.start();
    const account=rpc.accountInfo||{};
    this.fingerprint=crypto.createHash('sha256').update(JSON.stringify([account.id||'',account.email||''])).digest('hex');
    const config=await rpc.call('config/read',{includeLayers:false});this.overrides=conversationConfig(config?.config||{});
    let cursor;do{const servers=await rpc.call('mcpServerStatus/list',{limit:100,...(cursor?{cursor}:{})});
      for(const server of servers?.data||[])if(typeof server.name==='string')this.overrides[`mcp_servers.${server.name}.enabled`]=false;cursor=servers?.nextCursor;
    }while(cursor);
    try{const models=await rpc.call('model/list',{});this.models=(models?.data||[]).map(m=>({id:m.id,model:m.model,displayName:m.displayName||m.model,isDefault:!!m.isDefault}));}catch{}
    try{const saved=JSON.parse(fs.readFileSync(path.join(this.directory,'session.json'),'utf8'));if(saved.fingerprint===this.fingerprint)this.threadId=saved.threadId;}catch{}
    this.ready=true;this.update();
  }
  async ensureThread(model){
    const params={cwd:this.directory,approvalPolicy:'never',sandbox:'read-only',config:this.overrides,
      developerInstructions:'Your name is ShadowCyrene in every language. You are the conversational assistant in a personal desktop pet. Answer the user in their language. This client supports plain conversation only. Never invoke tools, run commands, read files, browse, access apps, or request approvals. Do not imply access to the official ChatGPT conversation.',...(model?{model}:{})};
    let result;
    if(this.threadId){try{result=await this.rpc.call('thread/resume',{...params,threadId:this.threadId});}catch{this.threadId=null;}}
    if(!result)result=await this.rpc.call('thread/start',{...params,serviceName:'shadowcyrene_companion'});
    if(!result?.thread?.id)throw new Error('无法建立桌宠会话。');this.threadId=result.thread.id;
    this.threadLoaded=true;
    fs.writeFileSync(path.join(this.directory,'session.json'),JSON.stringify({threadId:this.threadId,fingerprint:this.fingerprint}),{mode:0o600});
  }
  async send(text,model){
    if(this.busy)return {ok:false,error:'正在回复，请等待或先停止。'};
    if(!text.trim())return {ok:false,error:'请输入消息。'};
    this.busy=true;this.error='';this.cancelRequested=false;this.update();
    let didSubmit=false;
    try{
      if(!this.ready){if(!this.starting)this.starting=this.start().finally(()=>{this.starting=null;});await this.starting;}
      if(this.cancelRequested){this.busy=false;this.update();return {ok:false,error:'已取消发送。'};}
      model=model||this.models.find(m=>m.isDefault)?.model;
      if(!this.threadLoaded||!this.threadId||this.loadedModel!==model){await this.ensureThread(model);this.loadedModel=model;}
      if(this.cancelRequested){this.busy=false;this.update();return {ok:false,error:'已取消发送。'};}
      const localId=crypto.randomUUID();
      this.messages.push({id:localId,role:'user',text},{id:localId+'-reply',role:'assistant',text:''});
      this.messages=this.messages.slice(-60);
      this.turn={localId,threadId:this.threadId,id:null,items:new Map(),finished:false};this.update();
      didSubmit=true;
      const result=await this.rpc.call('turn/start',{threadId:this.threadId,clientUserMessageId:localId,input:[{type:'text',text}],approvalPolicy:'never',
        sandboxPolicy:{type:'readOnly',networkAccess:false},...(model?{model}:{})});
      if(this.turn&&!this.turn.finished)this.turn.id=result.turn?.id;
      if(this.cancelRequested)await this.cancel();
      return {ok:true,direct:true};
    }catch{
      this.busy=false;this.error=didSubmit?'提交状态未能确认，请先查看回复，避免重复发送；不会自动重发。':'聊天连接失败，草稿未发送，请检查连接后重试。';this.update();return {ok:false,error:this.error};
    }
  }
  onEvent({method,params:p}){
    if(!p||!this.turn||p.threadId!==this.turn.threadId)return;
    if(p.turnId&&this.turn.id&&p.turnId!==this.turn.id)return;
    if(p.turnId&&!this.turn.id)this.turn.id=p.turnId;
    if(method==='item/agentMessage/delta'){
      const id=p.itemId||'reply';this.turn.items.set(id,(this.turn.items.get(id)||'')+(typeof p.delta==='string'?p.delta:''));
    }else if(method==='item/completed'&&p.item?.type==='agentMessage')this.turn.items.set(p.item.id||'reply',p.item.text||'');
    else if(method==='turn/completed'){
      this.turn.finished=true;this.busy=false;
      if(p.turn?.status==='failed')this.error='回复失败，请检查额度与连接后再试。';
      if(p.turn?.status==='interrupted')this.error='已停止回复。';
    }else if(method!=='turn/started')return;
    const message=this.messages.find(m=>m.id===this.turn.localId+'-reply');
    if(message)message.text=[...this.turn.items.values()].join('\n');this.update();
  }
  async cancel(){this.cancelRequested=true;if(this.turn?.id&&!this.turn.finished)try{await this.rpc.call('turn/interrupt',{threadId:this.threadId,turnId:this.turn.id});}catch{} }
  reset(){if(this.busy)return false;this.threadId=null;this.threadLoaded=false;this.loadedModel=null;this.messages=[];this.error='';try{fs.unlinkSync(path.join(this.directory,'session.json'));}catch{}this.update();return true;}
  async stop(){this.closed=true;await Promise.race([this.cancel(),new Promise(r=>setTimeout(r,400))]);this.rpc?.stop();this.ready=false;this.busy=false;}
}
module.exports={ChatClient,CHAT_METHODS,conversationConfig};
