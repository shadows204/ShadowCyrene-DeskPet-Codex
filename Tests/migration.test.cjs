'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {migrateUserData}=require('../app/migration.cjs');
test('rename preserves preferences and session reference without copying credentials or overwriting new settings',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'shadowcyrene-migrate-')),old=path.join(root,'old'),next=path.join(root,'new');
  try{
    fs.mkdirSync(path.join(old,'conversation'),{recursive:true});
    fs.writeFileSync(path.join(old,'settings.json'),JSON.stringify({language:'ja',petScale:1.5}));
    fs.writeFileSync(path.join(old,'conversation/session.json'),JSON.stringify({threadId:'example',fingerprint:'reference'}));
    fs.writeFileSync(path.join(old,'auth.json'),'do not copy');
    assert.deepEqual(migrateUserData(next,old),['settings.json','conversation/session.json']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(next,'settings.json'))).language,'ja');
    assert.equal(fs.existsSync(path.join(next,'auth.json')),false);
    fs.writeFileSync(path.join(next,'settings.json'),JSON.stringify({language:'fr'}));
    assert.deepEqual(migrateUserData(next,old),[]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(next,'settings.json'))).language,'fr');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
