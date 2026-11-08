'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {computeLayout}=require('../app/layout.cjs');
const overlap=(a,b)=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
test('four corners retain the character, with a lower side-docked chat at the bottom',()=>{
  for(const[x,y]of[[0,0],[2000,0],[0,2000],[2000,2000]]){
    const r=computeLayout({width:1280,height:800,anchor:{x,y},settings:{},bubble:true,messages:true});
    assert.equal(r.pet.x,x===0?0:1088);assert.equal(r.pet.y,y===0?0:592);
    if(y>0){assert.equal(r.bottomDock,true);assert.equal(overlap(r.pet,r.chat),false);}
    for(const b of [r.pet,r.chat,r.quota,r.message]){assert.ok(b.x>=0&&b.y>=0);assert.ok(b.x+b.width<=1280.01&&b.y+b.height<=800.01);}
  }
});
test('messages stay center-side and quota uses the outward side when space exists',()=>{
  for(const x of[300,1000]){
    const r=computeLayout({width:1600,height:1000,anchor:{x,y:300},settings:{},bubble:true,messages:true});
    if(x<800){assert.ok(r.message.x>r.pet.x);assert.ok(r.quota.x<r.pet.x);}else{assert.ok(r.message.x<r.pet.x);assert.ok(r.quota.x>r.pet.x);}
    assert.equal(r.message.y,r.quota.y);
  }
});
test('edge fallback keeps quota closer to the edge than messages without moving the pet',()=>{
  const l=computeLayout({width:1280,height:800,anchor:{x:0,y:400},settings:{},bubble:true,messages:true});
  assert.equal(l.pet.x,0);assert.ok(l.quota.x<l.message.x);assert.equal(overlap(l.quota,l.message),false);
  const r=computeLayout({width:1280,height:800,anchor:{x:1088,y:400},settings:{},bubble:true,messages:true});
  assert.equal(r.pet.x,1088);assert.ok(r.quota.x>r.message.x);assert.equal(overlap(r.quota,r.message),false);
});
test('scaled components remain in the work area for common display sizes',()=>{
  for(const[width,height]of[[800,600],[1280,800],[1920,1080]])for(const scale of[.5,1,1.5,2])for(const x of[0,width/2,width]){
    const r=computeLayout({width,height,anchor:{x,y:height},settings:{scale,messageMode:'multi',messageLines:7},bubble:true,messages:true});
    for(const b of[r.pet,r.chat,r.quota,r.message])assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width+.01&&b.y+b.height<=height+.01);
  }
});
