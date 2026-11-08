'use strict';
// This script runs with the installed desktop app's bundled Electron/Node runtime.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
async function install(appPath,{checkOnly=false}={}){
  const mac=process.platform==='darwin';
  if(!mac&&process.platform!=='win32')throw Error('This installer supports macOS and Windows.');
  appPath=path.resolve(appPath);
  const executable=mac?path.join(appPath,'Contents/MacOS/ShadowCyrene'):fs.statSync(appPath).isDirectory()?path.join(appPath,'ShadowCyrene.exe'):appPath;
  const archive=mac?path.join(appPath,'Contents/Resources/app.asar'):path.join(path.dirname(executable),'resources/app.asar');
  const metadata=require(path.join(archive,'package.json'));
  if(metadata.name!=='shadowcyrene-deskpet-codex')throw Error('Select the installed ShadowCyrene app.');
  const numbers=metadata.version.split('.').map(Number);if(numbers[0]===0&&(numbers[1]<5||numbers[1]===5&&numbers[2]<1))throw Error('Update ShadowCyrene to 0.5.1 or later first.');
  const directory=mac?path.join(os.homedir(),'Library/Application Support/ShadowCyrene'):path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'ShadowCyrene');
  let settings={};try{settings=JSON.parse(fs.readFileSync(path.join(directory,'settings.json'),'utf8'));}catch{}
  const {findCLI}=require(path.join(archive,'app/platform.cjs')),cli=findCLI(settings);
  if(!cli)throw Error('Official Codex CLI not found. Choose it in ShadowCyrene connection settings first.');
  if(checkOnly)return{checked:true,version:metadata.version,cliFound:true};
  // Do not pass this runtime-only environment switch to any child processes.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const {installBridge}=require(path.join(archive,'app/plugin-installer.cjs'));
  const result=await installBridge({directory,executable,cli});
  return{installed:result.installed,version:metadata.version,plugin:result.plugin};
}
module.exports={install};
if(require.main===module){const app=process.argv[2];if(!app){console.error('Pass the path to ShadowCyrene.app or ShadowCyrene.exe.');process.exitCode=1;}else install(app,{checkOnly:process.argv.includes('--check')}).then(result=>{console.log(JSON.stringify(result,null,2));if(result.installed)console.log('Refresh plugins in the official client or start a new session to load ShadowCyrene.');}).catch(error=>{console.error(error.message.split('\n')[0]);process.exitCode=1;});}
