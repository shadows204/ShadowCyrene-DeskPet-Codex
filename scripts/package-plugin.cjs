'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
fs.chmodSync(path.join(root,'plugin-installer-kit/Install-ShadowCyrene-Plugin.command'),0o755);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
const zip=path.join(root,'dist',`ShadowCyrene-${version}-plugin-installer.zip`);
// The source files are text-only and contain no machine-specific generated MCP paths.
execFileSync('python3',['-c',`import pathlib,zipfile,sys
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted((root/'plugin-installer-kit').iterdir()):
  if p.is_file():
   name=str(pathlib.Path('ShadowCyrene-Plugin-Installer')/p.name)
   if p.suffix=='.cmd':
    entry=zipfile.ZipInfo.from_file(p,name);entry.compress_type=zipfile.ZIP_DEFLATED
    z.writestr(entry,p.read_bytes().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))
   else:z.write(p,name)
with zipfile.ZipFile(target) as z:assert z.testzip() is None
`,root,zip]);
console.log(zip);
