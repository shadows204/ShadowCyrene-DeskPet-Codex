'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const exists = p => !!p && fs.existsSync(p);
function cliCandidates(platform = process.platform, env = process.env, home = os.homedir(), appPath) {
  const out = [];
  if (platform === 'darwin') {
    for (const a of [appPath, '/Applications/ChatGPT.app', '/Applications/Codex.app', path.join(home, 'Applications/ChatGPT.app')].filter(Boolean)) {
      out.push(path.join(a, 'Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'));
      out.push(path.join(a, 'Contents/Resources/codex'));
    }
    out.push('/opt/homebrew/bin/codex', '/usr/local/bin/codex', path.join(home, '.local/bin/codex'));
  } else if (platform === 'win32') {
    const roots = [appPath && path.dirname(appPath), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs/ChatGPT'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs/Codex')].filter(Boolean);
    for (const root of roots) for (const name of ['resources/codex.exe', 'resources/codex-cli/codex.exe', 'codex.exe']) out.push(path.join(root, name));
    if (env.APPDATA) {
      const vendors = path.join(env.APPDATA, 'npm/node_modules/@openai/codex/vendor');
      out.push(path.join(vendors, 'x86_64-pc-windows-msvc/codex/codex.exe'), path.join(vendors, 'aarch64-pc-windows-msvc/codex/codex.exe'));
      out.push(path.join(env.APPDATA, 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex/codex.exe'));
    }
  }
  const sep = platform === 'win32' ? ';' : path.delimiter;
  for (const dir of (env.PATH || '').split(sep).filter(Boolean)) out.push(path.join(dir, platform === 'win32' ? 'codex.exe' : 'codex'));
  return [...new Set(out)];
}
async function detectOfficialApp(settings = {}) {
  try {
    if (process.platform === 'darwin') {
      const {stdout} = await run('/bin/ps', ['-axo', 'comm='], {timeout: 5000, maxBuffer: 2_000_000});
      const paths = stdout.split('\n').map(s => s.trim());
      const running = paths.find(s => /\/(ChatGPT|Codex)\.app\/Contents\/MacOS\/(ChatGPT|Codex)$/.test(s));
      const appPath = running ? running.slice(0, running.indexOf('.app/') + 4) : [settings.appPath, settings.discoveredAppPath, '/Applications/ChatGPT.app', '/Applications/Codex.app'].find(exists);
      return {running: !!running, appPath};
    }
    if (process.platform === 'win32') {
      const {stdout} = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique | ConvertTo-Json -Compress"], {windowsHide: true, timeout: 6000});
      let paths = []; try {const x = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]'); paths = Array.isArray(x) ? x : [x];} catch {}
      // Do not confuse our own codex app-server child with the desktop application's Codex.exe.
      paths=paths.filter(p=>typeof p==='string'&&!/[\\/](resources|vendor|codex-cli)[\\/]/i.test(p)&&p.toLowerCase()!==settings.cliPath?.toLowerCase()&&p.toLowerCase()!==settings.activeCLIPath?.toLowerCase());
      return {running: paths.length > 0, appPath: paths[0] || settings.appPath || settings.discoveredAppPath};
    }
  } catch { return {running: null, appPath: settings.appPath || settings.discoveredAppPath}; }
  return {running: false, appPath: settings.appPath};
}
function findCLI(settings, appPath) {
  return [settings.cliPath, ...cliCandidates(process.platform, process.env, os.homedir(), appPath)].find(p=>exists(p)&&path.resolve(p).toLowerCase()!==String(appPath||'').toLowerCase());
}
async function openOfficialApp(settings, detected, shell) {
  const appPath = settings.appPath || detected?.appPath || settings.discoveredAppPath;
  if (appPath && exists(appPath)) {
    if (process.platform === 'darwin') await run('/usr/bin/open', [appPath]);
    else {const error = await shell.openPath(appPath); if (error) throw new Error('无法打开所选官方应用。');}
    return;
  }
  if (process.platform === 'darwin') { await run('/usr/bin/open', ['-b', 'com.openai.codex']); return; }
  throw new Error('尚未找到官方应用，请在右键菜单的连接设置中选择 ChatGPT／Codex 程序。');
}
module.exports = {detectOfficialApp, findCLI, openOfficialApp, cliCandidates};
