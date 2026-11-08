'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {directionIndex,clampPosition,quotaView,blinkFrame,BLINK_DURATIONS}=require('../app/core.cjs');
const {gazeTarget,smoothGaze}=require('../app/core.cjs');
test('continuous gaze has no angular bins and remains bounded',()=>{
  const values=Array.from({length:101},(_,i)=>gazeTarget(i-50,100).x);
  assert.equal(new Set(values).size,101);
  for(let i=1;i<values.length;i++){assert.ok(values[i]>values[i-1]);assert.ok(values[i]-values[i-1]<.01);}
  assert.deepEqual(gazeTarget(0,0),{x:0,y:0});assert.ok(gazeTarget(1e9,-1e9).x<=1);
});
test('head easing converges without overshoot and is refresh-rate independent',()=>{
  let a={x:0,y:0},b={x:0,y:0};const target={x:1,y:-1};
  for(let i=0;i<60;i++)a=smoothGaze(a,target,1000/60,120);
  for(let i=0;i<120;i++)b=smoothGaze(b,target,1000/120,120);
  assert.ok(a.x>.999&&a.x<1);assert.ok(Math.abs(a.x-b.x)<1e-10);
});
test('all sixteen global directions, including cursor outside the window',()=>{
  for(let i=0;i<16;i++){const a=i*Math.PI/8;assert.equal(directionIndex(Math.sin(a)*500,-Math.cos(a)*500),i);}
  assert.equal(directionIndex(0,0),null);
  assert.equal(directionIndex(100000,0),4);
});
test('hysteresis suppresses boundary chatter without blocking turns',()=>{
  const a=Math.PI/16+.01;
  assert.equal(directionIndex(Math.sin(a)*100,-Math.cos(a)*100,0),0);
  assert.equal(directionIndex(100,0,0),4);
});
test('multi-monitor negative origins and DPI-independent coordinates',()=>{
  assert.deepEqual(clampPosition({x:-3000,y:2000},{x:-1920,y:0,width:1920,height:1080},{width:600,height:380}),{x:-1920,y:700});
});
test('Plus uses remaining, not consumed, and maps windows by duration',()=>{
  const q=quotaView({rateLimitsByLimitId:{codex:{planType:'plus',primary:{usedPercent:23,windowDurationMins:10080},secondary:{usedPercent:7,windowDurationMins:300}}}});
  assert.equal(q.plan,'plus');assert.equal(q.fiveHour.remaining,93);assert.equal(q.weekly.remaining,77);
});
test('Pro no-five-hour rule never overrides an actual server limit',()=>{
  const a=quotaView({rateLimits:{primary:null,secondary:{usedPercent:20,windowDurationMins:10080}}},'pro');
  assert.equal(a.fiveHourNotApplicable,true);assert.equal(a.weekly.remaining,80);
  const b=quotaView({rateLimits:{primary:{usedPercent:90,windowDurationMins:300}}},'pro_5x');
  assert.equal(b.fiveHour.remaining,10);assert.equal(b.fiveHourNotApplicable,false);
});
test('missing data remains unknown; percentages bounded; other buckets preserved',()=>{
  const empty=quotaView({},'pro');assert.equal(empty.fiveHourNotApplicable,false);assert.equal(empty.fiveHour,null);
  const q=quotaView({rateLimitsByLimitId:{a:{primary:{usedPercent:102,windowDurationMins:300}},b:{primary:{usedPercent:-3,windowDurationMins:60}}}},'plus','b');
  assert.equal(q.id,'b');assert.equal(q.extra[0].remaining,100);assert.equal(q.fiveHour,null);assert.deepEqual(q.ids,['a','b']);
});
test('blink closes for 45ms and completes in 210ms, rather than a multi-second hold',()=>{
  assert.equal(BLINK_DURATIONS.reduce((a,b)=>a+b),210);
  assert.equal(blinkFrame(0),1);assert.equal(blinkFrame(26),2);assert.equal(blinkFrame(71),3);
  assert.equal(blinkFrame(116),2);assert.equal(blinkFrame(210),null);
});
