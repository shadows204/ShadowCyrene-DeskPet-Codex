'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {AttachmentStore,turnInput,decodeText,readDocument,MAX_FILE_BYTES}=require('../app/attachments.cjs');
test('selected files become owned draft references; preview metadata excludes document content',async()=>{
  const store=new AttachmentStore();const bytes=Buffer.from('private attachment text');
  await store.addBuffer({name:'../document.txt',bytes});const [file]=store.snapshot();assert.equal(file.name,'document.txt');assert.equal(file.kind,'text');assert.equal(file.input,undefined);
  await store.addBuffer({name:'document.txt',bytes});assert.equal(store.snapshot().length,1);
  const input=turnInput('Please summarize.',store.resolve([file.id]));assert.equal(input[1].type,'text');assert.ok(input[1].text.includes('private attachment text'));assert.ok(input[1].text.includes('reference data'));
  assert.throws(()=>store.resolve(['unselected-id']));store.remove(file.id);assert.throws(()=>store.resolve([file.id]));
});
test('attachment limits and unsupported binary content fail without entering the draft',async()=>{
  const store=new AttachmentStore();await assert.rejects(store.addBuffer({name:'oversize.png',bytes:Buffer.alloc(MAX_FILE_BYTES+1)}),/10MB/);
  await assert.rejects(store.addBuffer({name:'program.exe',bytes:Buffer.from('binary')}),/格式/);
  await assert.rejects(store.addBuffer({name:'binary.txt',bytes:Buffer.from([0,1,2])}),/文本/);
  await assert.rejects(store.addBuffer({name:'empty.txt',bytes:Buffer.alloc(0)}),/为空/);
  for(let i=0;i<6;i++)await store.addBuffer({name:`${i}.txt`,bytes:Buffer.from('file '+i)});
  await assert.rejects(store.addBuffer({name:'extra.txt',bytes:Buffer.from('extra')}),/6个/);assert.equal(store.snapshot().length,6);
});
test('UTF-8 and UTF-16 text survive extraction and invalid bytes are rejected',()=>{
  assert.equal(decodeText(Buffer.from('中文正文')),'中文正文');
  assert.equal(decodeText(Buffer.concat([Buffer.from([255,254]),Buffer.from('中文','utf16le')])),'中文');assert.throws(()=>decodeText(Buffer.from([255,255,254])));
});
test('PDF and DOCX readers extract real fixture text; unreadable scans never appear successfully attached',async()=>{
  for(const [name,expected]of [['sample.pdf','ShadowCyrene PDF'],['sample.docx','中文正文']]){
    const store=new AttachmentStore();await store.addPath(path.join(__dirname,'fixtures',name));const [file]=store.snapshot();assert.equal(file.textOnly,true);assert.ok(store.resolve([file.id])[0].input.text.includes(expected));
  }
  const store=new AttachmentStore({documentReader:async()=>''});await assert.rejects(store.addBuffer({name:'scan.pdf',bytes:Buffer.from('scan')}),/扫描件/);assert.equal(store.snapshot().length,0);
});
test('image-only turns use actual image inputs, and clearing cancels an in-progress import',async()=>{
  let finish;const gate=new Promise(r=>finish=r);const store=new AttachmentStore({imageProcessor:async()=>{await gate;return{preview:'data:image/png;base64,AA==',url:'data:image/png;base64,AAAA'}}});
  const pending=store.addBuffer({name:'shot.png',bytes:Buffer.from('fixture')});assert.equal(store.pendingCount,1);store.clear();finish();await assert.rejects(pending,/取消/);assert.equal(store.snapshot().length,0);
  await store.addBuffer({name:'shot.png',bytes:Buffer.from('fixture')});const input=turnInput('',store.resolve([store.snapshot()[0].id]));assert.equal(input[1].type,'image');assert.equal(input[1].url,'data:image/png;base64,AAAA');assert.equal(input[1].path,undefined);
});
