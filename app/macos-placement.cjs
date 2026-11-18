'use strict';
const {computeLayout,fitOverlay}=require('./layout.cjs');

const intersects=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
const validRect=value=>value&&['x','y','width','height'].every(key=>Number.isFinite(value[key]))&&value.width>0&&value.height>0;

function withoutRect(area, obstacle) {
  if(!intersects(area,obstacle))return [area];
  const left=Math.max(area.x,Math.floor(obstacle.x));
  const right=Math.min(area.x+area.width,Math.ceil(obstacle.x+obstacle.width));
  const top=Math.max(area.y,Math.floor(obstacle.y));
  const bottom=Math.min(area.y+area.height,Math.ceil(obstacle.y+obstacle.height));
  return [
    {...area,width:left-area.x},
    {...area,x:right,width:area.x+area.width-right},
    {...area,height:top-area.y},
    {...area,y:bottom,height:area.y+area.height-bottom},
  ].filter(rect=>rect.width>=112&&rect.height>=112);
}

function placeStoreOverlay({preferred,display,displays,anchor,settings,composerHeight,visible,snapshot}) {
  const storefront=validRect(snapshot.storeWindow)?snapshot.storeWindow:display.workArea;
  const predicted={
    x:storefront.x+storefront.width*0.14,
    y:storefront.y+storefront.height*0.1,
    width:storefront.width*0.72,
    height:storefront.height*0.8,
  };
  const observed=(Array.isArray(snapshot.paymentWindows)?snapshot.paymentWindows:[]).filter(validRect).slice(0,8)
    .map(rect=>({x:rect.x-12,y:rect.y-12,width:rect.width+24,height:rect.height+24}));
  const obstacles=[predicted,...observed];
  if(obstacles.every(rect=>!intersects(preferred.bounds,rect)))return preferred;

  function findPlacement(blockedAreas) {
    let best;
    for(const screen of [display,...displays.filter(screen=>screen.id!==display.id)]){
      let candidates=[screen.workArea];
      for(const obstacle of blockedAreas){
        const unique=new Map();
        for(const area of candidates.flatMap(area=>withoutRect(area,obstacle))){
          unique.set(`${area.x},${area.y},${area.width},${area.height}`,area);
        }
        candidates=[...unique.values()].sort((a,b)=>b.width*b.height-a.width*a.height).slice(0,48);
      }
      for(const area of candidates){
        const layout=computeLayout({
          width:area.width,height:area.height,
          anchor:{x:anchor.x-area.x,y:anchor.y-area.y},
          settings,composerHeight,bubble:visible.bubble,messages:visible.messages,
        });
        const result=fitOverlay(layout,area,visible);
        const distance=Math.hypot(area.x+layout.pet.x-anchor.x,area.y+layout.pet.y-anchor.y);
        // Prefer full-size placements, then the user's display and nearest position.
        const score=layout.pet.scale*10000+(screen.id===display.id?5000:0)-distance;
        if(!best||score>best.score)best={score,result};
      }
    }
    return best?.result;
  }

  const placement=findPlacement(obstacles);
  if(placement)return placement;
  // Actual sheet bounds take precedence when the predicted area is more conservative.
  if(observed.every(rect=>!intersects(preferred.bounds,rect)))return preferred;
  const outsideSheet=findPlacement(observed);
  if(outsideSheet)return outsideSheet;
  // No disjoint usable space, for example a system dialog covering the entire display.
  // Keep our window ordered on screen but below other normal windows.
  return {...preferred,behindStore:true};
}

module.exports={placeStoreOverlay,intersects};
