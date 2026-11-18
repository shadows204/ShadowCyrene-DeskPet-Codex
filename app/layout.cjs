(() => {
'use strict';
const bound=(v,min,max)=>Math.max(min,Math.min(v,Math.max(min,max)));
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
function computeLayout({width,height,anchor,settings={},bubble=false,messages=false,composerHeight=40}){
  width=Math.max(112,width);height=Math.max(112,height);
  const overall=bound(finite(settings.scale,1),.5,2);
  const scaleFor=(kind,w,h)=>Math.min(overall*bound(finite(settings[kind],1),.5,2),(width-8)/w,(height-8)/h);
  const chatWidth=settings.chatCollapsed?40:320,chatHeight=settings.chatCollapsed?40:composerHeight;
  const ps=scaleFor('petScale',192,208),cs=scaleFor('chatScale',chatWidth,chatHeight),qs=scaleFor('panelScale',208,216);
  const lines=bound(Math.round(finite(settings.messageLines,6)),5,7);
  const mh=settings.messageMode==='single'?48:lines*20+46;
  const ms=scaleFor('panelScale',290,mh),gap=8*overall;
  const pet={x:bound(finite(anchor?.x,width-192*ps-8),0,width-192*ps),y:bound(finite(anchor?.y,height-208*ps-64),0,height-208*ps),width:192*ps,height:208*ps,scale:ps};
  const right=pet.x+pet.width/2<width/2;
  const inner=right?width-pet.x-pet.width-gap-4:pet.x-gap-4;
  let chatScale=cs,cw=chatWidth*cs,ch=chatHeight*cs;
  let cx=pet.x+pet.width/2-cw/2,cy=pet.y+pet.height+10*overall;
  const bottomDock=cy+ch>height-4;
  if(bottomDock){
    chatScale=Math.min(cs,Math.max(.15,inner/chatWidth));cw=chatWidth*chatScale;ch=chatHeight*chatScale;
    cx=right?pet.x+pet.width+gap:pet.x-cw-gap;cy=height-ch-4;
  }
  const box=(x,y,w,h,s)=>({x:bound(x,4,width-w),y:bound(y,4,height-h),width:w,height:h,scale:s});
  const chat=box(cx,cy,cw,ch,chatScale);
  const needsChatSpace=settings.chat!==false&&(bottomDock||chat.x<pet.x||chat.x+chat.width>pet.x+pet.width);
  const maxBottom=needsChatSpace?chat.y-gap-(settings.offlineHint&&!settings.chatCollapsed?22:0):height-4;
  let qScale=Math.max(.05,Math.min(qs,(maxBottom-4)/216)),mScale=Math.max(.05,Math.min(ms,(maxBottom-4)/mh));
  const outerSpace=(right?pet.x:width-pet.x-pet.width)-gap-4;
  const outwardFits=outerSpace>=208*qScale;
  if(outwardFits){if(messages)mScale=Math.min(mScale,Math.max(.1,inner/290));}
  else{
    const sum=(bubble?208*qScale:0)+(messages?290*mScale:0),spacing=bubble&&messages?gap:0;
    const fit=Math.min(1,Math.max(.1,(inner-spacing)/Math.max(1,sum)));
    if(bubble)qScale*=fit;if(messages)mScale*=fit;
  }
  const qw=208*qScale,qh=216*qScale,mw=290*mScale,msgH=mh*mScale;
  let qx=right?pet.x-qw-gap:pet.x+pet.width+gap;
  let mx=right?pet.x+pet.width+gap:pet.x-mw-gap;
  if(!outwardFits){qx=right?pet.x+pet.width+gap:pet.x-qw-gap;if(bubble)mx=right?qx+qw+gap:qx-mw-gap;}
  const top=bound(pet.y+14*ps,4,maxBottom-Math.max(qh,msgH));
  const quota=box(qx,top,qw,qh,qScale),message=box(mx,top,mw,msgH,mScale);
  const hintWidth=Math.min(360,width-12);
  const below=chat.y+chat.height+5;
  const hint={
    x:bound(chat.x+(chat.width-hintWidth)/2,6,width-hintWidth-6),
    y:below+32<=height?below:Math.max(4,chat.y-32),
    width:hintWidth,height:32,
  };
  return {pet,chat,quota,message,hint,centerSide:right?'right':'left',quotaFallback:!outwardFits,bottomDock,viewport:{width,height},messageLines:lines};
}

function fitOverlay(layout, area, visible) {
  // Keep the layout in display coordinates until the last step, so window resizing
  // cannot affect where the pet is anchored or how its panels dock.
  const rectangles=[layout.pet];
  if(visible.chat)rectangles.push(layout.chat);
  if(visible.bubble)rectangles.push(layout.quota);
  if(visible.messages)rectangles.push(layout.message);
  if(visible.hint)rectangles.push(layout.hint);
  const padding=24;
  const left=Math.max(0,Math.floor(Math.min(...rectangles.map(r=>r.x))-padding));
  const top=Math.max(0,Math.floor(Math.min(...rectangles.map(r=>r.y))-padding));
  const right=Math.min(area.width,Math.ceil(Math.max(...rectangles.map(r=>r.x+r.width))+padding));
  const bottom=Math.min(area.height,Math.ceil(Math.max(...rectangles.map(r=>r.y+r.height))+padding));
  const local={...layout};
  for(const key of ['pet','chat','quota','message','hint']){
    const rect=layout[key];
    local[key]={...rect,x:rect.x-left,y:rect.y-top};
  }
  return {layout:local,bounds:{x:area.x+left,y:area.y+top,width:right-left,height:bottom-top}};
}
const api={computeLayout,fitOverlay};if(typeof module!=='undefined')module.exports=api;else window.ShadowCyreneLayout=api;
})();
