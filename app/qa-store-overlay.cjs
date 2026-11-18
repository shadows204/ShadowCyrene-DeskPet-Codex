'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {intersects}=require('./macos-placement.cjs');

async function run({win,screen,state,broadcast,setAnchor,updateOverlayContext,qaOutput}){
  const area=screen.getPrimaryDisplay().workArea;
  const sheet={x:area.x+Math.round(area.width*.25),y:area.y+Math.round(area.height*.18),
    width:Math.round(area.width*.5),height:Math.round(area.height*.64)};
  // Put the real BrowserWindow over a synthetic sheet, then exercise the same
  // input used by the native observer. No App Store session is touched.
  setAnchor({x:sheet.x+12,y:sheet.y+12});
  state.appRunning=true;
  broadcast();
  const before=win.getBounds();
  assert.ok(intersects(before,sheet));
  assert.ok(before.width<area.width&&before.height<area.height);
  updateOverlayContext({store:true,storeWindow:area,paymentWindows:[]});
  const browsing=win.getBounds();
  assert.equal(win.isVisible(),true);
  assert.equal(intersects(browsing,sheet),false);
  updateOverlayContext({store:true,storeWindow:area,paymentWindows:[sheet]});
  const confirmation=win.getBounds();
  assert.equal(win.isVisible(),true);
  assert.equal(intersects(confirmation,sheet),false);

  const view=await win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>{
    const pet=document.getElementById('pet').getBoundingClientRect();
    const chat=document.getElementById('composer').getBoundingClientRect();
    resolve({width:innerWidth,height:innerHeight,petRight:pet.right,petBottom:pet.bottom,chatRight:chat.right,chatBottom:chat.bottom});
  }))`);
  assert.ok(view.petRight<=view.width+1&&view.petBottom<=view.height+1);
  assert.ok(view.chatRight<=view.width+1&&view.chatBottom<=view.height+1);
  updateOverlayContext({store:false,paymentWindows:[]});
  const restored=win.getBounds();
  assert.deepEqual(restored,before);
  fs.mkdirSync(qaOutput,{recursive:true});
  fs.writeFileSync(path.join(qaOutput,'store-overlay-report.json'),JSON.stringify({before,browsing,confirmation,restored,sheet,view},null,2));
}
module.exports={run};
