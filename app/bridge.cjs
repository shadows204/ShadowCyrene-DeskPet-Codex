'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const registryPath=()=>process.env.SHADOWCYRENE_BRIDGE_FILE||path.join(os.homedir(),'.shadowcyrene','bridge.json');
class PresenceBridge{
  constructor({file=registryPath(),onChange=()=>{},now=Date.now}={}){this.file=file;this.onChange=onChange;this.now=now;this.clients=new Map();this.active=false;this.token=crypto.randomBytes(32).toString('hex');}
  async start(){
    this.server=http.createServer((req,res)=>{
      const respond=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
      if(req.headers.origin||req.headers.authorization!==`Bearer ${this.token}`)return respond(403,{error:'forbidden'});
      if(req.method==='GET'&&req.url==='/status')return respond(200,{petRunning:true,version:require('../package.json').version,pluginConnected:this.active});
      if(req.method!=='POST'||req.url!=='/presence')return respond(404,{});
      let data='';req.on('data',chunk=>{data+=chunk;if(data.length>4096)req.destroy();});
      req.on('end',()=>{let msg;try{msg=JSON.parse(data);}catch{return respond(400,{});}
        if(typeof msg.clientId!=='string'||msg.clientId.length>100)return respond(400,{});
        if(msg.active===false)this.clients.delete(msg.clientId);else this.clients.set(msg.clientId,this.now());
        this.sweep();respond(200,{petRunning:true});
      });
    });
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    fs.writeFileSync(this.file,JSON.stringify({port:this.server.address().port,token:this.token,pid:process.pid}),{mode:0o600});
    this.timer=setInterval(()=>this.sweep(),2000);return this;
  }
  sweep(){for(const[id,stamp]of this.clients)if(this.now()-stamp>12000)this.clients.delete(id);const active=this.clients.size>0;if(active!==this.active){this.active=active;this.onChange(active);}}
  async stop(){clearInterval(this.timer);try{if(JSON.parse(fs.readFileSync(this.file,'utf8')).token===this.token)fs.unlinkSync(this.file);}catch{}
    if(this.server)await new Promise(r=>this.server.close(r));}
}
function requestPresence(file,clientId,active=true){
  return new Promise(resolve=>{
    let data;try{const stat=fs.statSync(file);if(process.platform!=='win32'&&((stat.mode&0o077)!==0||stat.uid!==process.getuid()))return resolve({petRunning:false});data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return resolve({petRunning:false});}
    if(!Number.isInteger(data.port)||data.port<1||data.port>65535||typeof data.token!=='string')return resolve({petRunning:false});
    const req=http.request({hostname:'127.0.0.1',port:data.port,path:'/presence',method:'POST',headers:{Authorization:`Bearer ${data.token}`,'Content-Type':'application/json'},timeout:1500},res=>{let text='';res.on('data',c=>{if(text.length<4096)text+=c;});res.on('end',()=>{try{resolve(res.statusCode===200?JSON.parse(text):{petRunning:false});}catch{resolve({petRunning:false});}});});
    req.on('timeout',()=>req.destroy());req.on('error',()=>resolve({petRunning:false}));req.end(JSON.stringify({clientId,active}));
  });
}
module.exports={PresenceBridge,requestPresence,registryPath};
