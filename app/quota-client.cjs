'use strict';
const {EventEmitter} = require('node:events');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const os=require('node:os');
// Only these read-only methods can be sent by this bridge.
const METHODS = new Set(['initialize', 'initialized', 'account/read', 'account/rateLimits/read']);
class QuotaClient extends EventEmitter {
  constructor(executable, {spawnProcess = spawn, timeout = 18000,methods=METHODS,args=['-c','features.plugins=false','-c','features.apps=false','-c','features.hooks=false','app-server']} = {}) {
    super(); this.executable = executable; this.spawnProcess = spawnProcess; this.timeout = timeout;
    this.pending = new Map(); this.seq = 0; this.closed = false;
    this.methods=methods;this.args=args;
  }
  async start() {
    this.child = this.spawnProcess(this.executable, this.args, {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,cwd:os.homedir()});
    this.child.on('error', () => this.fail('CLI 无法启动，请在连接设置中选择官方 codex 可执行文件。'));
    this.child.stdin.on('error',()=>{if(!this.closed)this.fail('连接已断开，消息不会自动重发。');});
    // Deliberately never forward or persist CLI stderr: it can contain private paths/account metadata.
    this.child.stderr.on('data', () => {});
    this.lines = readline.createInterface({input: this.child.stdout});
    this.lines.on('line', line => {
      if (line.length > 2_000_000) return;
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.id !== undefined && !msg.method && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) {
          const error=new Error('官方接口暂不可用，请确认本机 CLI 已登录。');
          error.rpcMethod=p.method;error.rpcCode=msg.error.code;
          const keywords=['401','403','429','unauthorized','refresh','connection','timeout','network','resolve','directory','certificate','request','invalid','cwd','home','credential','permission','access','client','initialize','sqlite','attestation','schema'].filter(word=>String(msg.error.message).toLowerCase().includes(word));
          this.emit('diagnostic',{method:p.method,code:msg.error.code,keywords});p.reject(error);
        }
        else p.resolve(msg.result);
      } else if (msg.method === 'account/rateLimits/updated') {
        this.emit('limits', msg.params);
      } else if (msg.method === 'account/updated') {
        this.emit('account', {planType: msg.params?.planType});
        this.refresh().catch(() => {});
      }
      if(msg.method&&msg.id!==undefined&&!this.pending.has(msg.id)){
        // No tool approval, user-input, dynamic tool, or credential request is accepted here.
        this.child.stdin.write(JSON.stringify({id:msg.id,error:{code:-32601,message:'Unsupported in ShadowCyrene'}})+'\n');
      }else if(msg.method)this.emit('notification',msg);
    });
    this.child.on('exit', () => { if (!this.closed) this.fail('额度连接已断开，将自动重试。'); });
    await this.call('initialize', {clientInfo: {name: 'shadowcyrene', title: 'ShadowCyrene', version: require('../package.json').version}});
    this.send({method: 'initialized', params: {}});
    const result = await this.call('account/read', {refreshToken: false});
    if (!result?.account || result.account.type === 'apiKey') throw new Error('请先在官方 Codex CLI 使用 ChatGPT 账户登录。');
    this.accountInfo=result.account;
    this.emit('account', {planType: result.account.planType});
    return this.refresh();
  }
  refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.call('account/rateLimits/read').then(value => { this.emit('limits', value); return value; }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }
  send(msg) {
    if (!this.methods.has(msg.method)) throw new Error('Non-read-only method rejected');
    if (this.closed || !this.child?.stdin.writable) throw new Error('额度连接尚未就绪。');
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }
  call(method, params) {
    if (!this.methods.has(method)) return Promise.reject(new Error('Non-read-only method rejected'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('额度查询超时。')); }, this.timeout);
      this.pending.set(id, {resolve, reject, timer,method});
      try { this.send({id, method, ...(params ? {params} : {})}); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  fail(message) {
    for (const p of this.pending.values()) {clearTimeout(p.timer); p.reject(new Error(message));}
    this.pending.clear(); this.emit('offline', message);
  }
  stop() {
    this.closed = true; this.lines?.close();
    for (const p of this.pending.values()) {clearTimeout(p.timer); p.reject(new Error('连接关闭'));}
    this.pending.clear();
    if (this.child) { this.child.stdin.destroy(); this.child.kill(); }
  }
}
module.exports = {QuotaClient, METHODS};
