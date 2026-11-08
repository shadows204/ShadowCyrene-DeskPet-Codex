'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {catalog,t,languages}=require('../app/i18n.cjs');const {dragRunPose}=require('../app/core.cjs');
test('five languages cover all catalog entries and preserve format variables',()=>{
  assert.equal(languages.length,5);
  const vars=s=>[...s.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();
  for(const[source,values]of Object.entries(catalog)){assert.equal(values.length,4);for(const value of values){assert.ok(value.trim());assert.deepEqual(vars(value),vars(source));}}
  assert.equal(t('剩余 {percent}%','en',{percent:76}),'76% remaining');
  assert.equal(t('6行 · 粉色渐隐','fr'),'6 lignes · Fondu rose');
  for(const language of languages){assert.equal(t('ShadowCyrene',language.id),'ShadowCyrene');assert.ok(t('ShadowCyrene · 对话',language.id).startsWith('ShadowCyrene'));}
});
test('running selects actual left/right atlas rows and changes direction without a delayed flip',()=>{
  let r=dragRunPose();for(let i=0;i<30;i++)r=dragRunPose(r,{active:true,vx:220,vy:0},16.7);
  assert.equal(r.row,1);assert.ok(r.column>=0&&r.column<8);
  r=dragRunPose(r,{active:true,vx:-220,vy:0},16.7);assert.equal(r.row,2);assert.ok(r.running);
});
test('gait speed is bounded, scale-aware and settles when the held cursor stops',()=>{
  const settle=(speed,scale=1)=>{let r=dragRunPose();for(let i=0;i<100;i++)r=dragRunPose(r,{active:true,vx:speed,scale},16.7);return r;};
  const slow=settle(90),fast=settle(360),huge=settle(10000),large=settle(360,2);
  assert.ok(fast.fps>slow.fps);assert.ok(huge.fps<=18&&slow.fps>=7);assert.ok(large.fps<fast.fps);
  let r=fast;for(let i=0;i<40;i++)r=dragRunPose(r,{active:true,vx:0,vy:0},16.7);assert.equal(r.running,false);
  assert.equal(dragRunPose(fast,{active:false},16.7).row,0);assert.equal(dragRunPose({}, {active:true,vx:0,vy:0},16.7).running,false);
});
