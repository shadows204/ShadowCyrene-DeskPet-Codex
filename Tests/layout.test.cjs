'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {computeLayout,fitOverlay}=require('../app/layout.cjs');
const {placeStoreOverlay}=require('../app/macos-placement.cjs');
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

test('the compact overlay stays outside an offset purchase sheet on a narrow display',()=>{
  const workArea={x:-800,y:24,width:800,height:576};
  const display={id:1,workArea};
  const anchor={x:-500,y:200};
  const settings={scale:1.5,messageMode:'multi'};
  const visible={chat:true,bubble:true,messages:true,hint:true};
  const layout=computeLayout({...workArea,anchor:{x:anchor.x-workArea.x,y:anchor.y-workArea.y},settings,bubble:true,messages:true});
  const preferred=fitOverlay(layout,workArea,visible);
  const sheet={x:-655,y:90,width:480,height:410};
  assert.ok(overlap(preferred.bounds,sheet));
  const result=placeStoreOverlay({preferred,display,displays:[display],anchor,settings,visible,composerHeight:40,
    snapshot:{storeWindow:workArea,paymentWindows:[sheet]}});
  assert.equal(overlap(result.bounds,sheet),false);
  for(const rect of [result.layout.pet,result.layout.chat,result.layout.quota,result.layout.message,result.layout.hint]){
    assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=result.bounds.width+.01&&rect.y+rect.height<=result.bounds.height+.01);
  }
});

test('a confirmation that fills one display moves the pet to another display when available',()=>{
  const workArea={x:0,y:24,width:1440,height:810};
  const display={id:1,workArea};
  const second={id:2,workArea:{x:-1920,y:24,width:1920,height:1056}};
  const anchor={x:900,y:500},settings={},visible={chat:true};
  const layout=computeLayout({...workArea,anchor,settings});
  const preferred=fitOverlay(layout,workArea,visible);
  const input={preferred,display,displays:[display,second],anchor,settings,visible,composerHeight:40,
    snapshot:{storeWindow:workArea,paymentWindows:[workArea]}};
  const placement=placeStoreOverlay(input);
  assert.equal(overlap(placement.bounds,workArea),false);
  assert.ok(placement.bounds.x+placement.bounds.width<=-12);
  assert.equal(placeStoreOverlay({...input,displays:[display]}).behindStore,true);
});
