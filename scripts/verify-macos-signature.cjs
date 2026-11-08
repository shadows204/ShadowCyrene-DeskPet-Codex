'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
function verifyApp(app,identifier='io.github.shadows204.shadowcyrene'){
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:['ignore','pipe','pipe']});
  // codesign prints display output on stderr.
  const result=require('node:child_process').spawnSync('/usr/bin/codesign',['--display','--verbose=4',app],{encoding:'utf8'});
  if(result.status!==0)throw Error('Cannot inspect code signature');const description=result.stdout+result.stderr;
  if(!description.includes(`Identifier=${identifier}\n`)||description.includes('Sealed Resources=none')||description.includes('Info.plist=not bound'))throw Error('App identity or resource seal is invalid');
  return{app:path.basename(app),identifier,signatureValid:true,resourceSealValid:true,signing:description.includes('Signature=adhoc')?'ad-hoc':'certificate'};
}
module.exports=async context=>{if(context.electronPlatformName==='darwin')verifyApp(path.join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`),context.packager.appInfo.id);};
module.exports.verifyApp=verifyApp;
if(require.main===module)for(const app of process.argv.slice(2))console.log(JSON.stringify(verifyApp(path.resolve(app))));
