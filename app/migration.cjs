'use strict';
const fs=require('node:fs'),path=require('node:path');
// Compatibility only: legacy names are never used as the new application's identity.
const legacyDataName='Cyrene Companion';
function migrateUserData(target,source){
  const migrated=[];
  for(const name of ['settings.json','conversation/session.json']){
    const destination=path.join(target,name);
    if(fs.existsSync(destination))continue;
    try{
      const data=JSON.parse(fs.readFileSync(path.join(source,name),'utf8'));
      if(!data||typeof data!=='object'||Array.isArray(data))continue;
      fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
      fs.writeFileSync(destination,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
      migrated.push(name);
    }catch{}
  }
  return migrated;
}
module.exports={migrateUserData,legacyDataName};
