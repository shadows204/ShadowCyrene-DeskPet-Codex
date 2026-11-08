'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {verifyApp}=require('./verify-macos-signature.cjs');
module.exports=async result=>{
  const archives=result.artifactPaths.filter(p=>/-macOS-(arm64|x64)\.zip$/.test(p));if(!archives.length)return[];
  const checks=[];
  for(const archive of archives){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shadowcyrene-sign-check-'));
    try{execFileSync('/usr/bin/ditto',['-x','-k',archive,temp]);const check=verifyApp(path.join(temp,'ShadowCyrene.app'));checks.push({file:path.basename(archive),...check});}
    finally{fs.rmSync(temp,{recursive:true,force:true});}
  }
  const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/macos-archive-signatures.json'),JSON.stringify({version:require('../package.json').version,checks,appleNotarized:false},null,2)+'\n');
  console.log('Verified macOS signatures after ZIP extraction:',checks.map(c=>c.file).join(', '));return[];
};
