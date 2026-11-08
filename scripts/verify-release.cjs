'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
const targets=[['macOS-arm64','dist/mac-arm64/ShadowCyrene.app/Contents/Resources/app.asar'],['macOS-x64','dist/mac/ShadowCyrene.app/Contents/Resources/app.asar'],['Windows-x64','dist/win-unpacked/resources/app.asar']];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=fs.readdirSync(path.join(root,'app')).map(n=>'app/'+n).concat(fs.readdirSync(path.join(root,'Resources')).map(n=>'Resources/'+n).concat(['README.md','LICENSE-NOTICE.md']));
const report={targets:[]};
for(const [name,relative]of targets){
  const archive=path.join(root,relative),result={name,files:[],ok:true};
  for(const file of files){const expected=hash(fs.readFileSync(path.join(root,file)));let actual;
    try{actual=hash(asar.extractFile(archive,file));}catch{actual=null;}
    const matches=expected===actual;result.files.push({file,sha256:actual,matches});result.ok&&=matches;
  }
  const names=asar.listPackage(archive);
  result.noAccountFiles=!names.some(n=>/auth\.json|settings\.json|private|electron-data|node_modules/.test(n));
  result.ok&&=result.noAccountFiles;report.targets.push(result);
}
const resedit=require('resedit');
const executable=resedit.NtExecutable.from(fs.readFileSync(path.join(root,'dist/win-unpacked/ShadowCyrene.exe')));
const resources=resedit.NtExecutableResource.from(executable);
const groups=resedit.Resource.IconGroupEntry.fromEntries(resources.entries);
const embedded=groups.find(g=>g.id===1)?.getIconItemsFromEntries(resources.entries)||[];
const expected=resedit.Data.IconFile.from(fs.readFileSync(path.join(root,'Resources/icon.ico'))).icons.map(i=>i.data);
const iconHash=i=>hash(Buffer.from(i.isRaw()?i.bin:i.generate()));
const version=resedit.Resource.VersionInfo.fromEntries(resources.entries)[0];
const strings=version?.getStringValues(version.getAllLanguagesForStringValues()[0])||{};
report.windows={iconSizes:embedded.map(i=>i.width||256),iconsMatch:embedded.length===expected.length&&embedded.every((i,n)=>iconHash(i)===iconHash(expected[n])),productName:strings.ProductName,fileDescription:strings.FileDescription};
report.windows.ok=report.windows.iconsMatch&&strings.ProductName==='ShadowCyrene'&&strings.FileDescription==='ShadowCyrene';
report.macIcons=['mac-arm64','mac'].map(dir=>{const actual=fs.readFileSync(path.join(root,`dist/${dir}/ShadowCyrene.app/Contents/Resources/icon.icns`));return{directory:dir,matches:hash(actual)===hash(fs.readFileSync(path.join(root,'Resources/icon.icns')))};});
report.ok=report.targets.every(t=>t.ok)&&report.windows.ok&&report.macIcons.every(i=>i.matches);
fs.writeFileSync(path.join(root,'qa/packaged-files-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({ok:report.ok,targets:report.targets.map(t=>({name:t.name,ok:t.ok,files:t.files.length,noAccountFiles:t.noAccountFiles})),windows:report.windows,macIcons:report.macIcons},null,2));
if(!report.ok)process.exitCode=1;
