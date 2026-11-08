'use strict';
// Run with Electron. Compile deterministic platform icons from the existing sprite artwork.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),resources=path.join(root,'Resources');
app.setName('ShadowCyrene Icon Builder');
app.whenReady().then(async()=>{
  const image=nativeImage.createFromPath(path.join(resources,'atlas.png')).crop({x:0,y:0,width:192,height:208});
  const bitmap=image.toBitmap(),size=image.getSize();let x0=size.width,y0=size.height,x1=0,y1=0;
  for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++)if(bitmap[(y*size.width+x)*4+3]>12){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const bounds={x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
  const win=new BrowserWindow({show:false,width:1024,height:1024,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  await win.loadURL('data:text/html,<html><body></body></html>');
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const image=new Image();image.src=${JSON.stringify(image.toDataURL())};await image.decode();
    const b=${JSON.stringify(bounds)};
    function render(size,tray){
      const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');
      g.scale(size/1024,size/1024);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      g.beginPath();g.roundRect(tray?20:64,tray?20:64,tray?984:896,tray?984:896,tray?492:210);g.clip();
      const gradient=g.createLinearGradient(100,70,900,980);gradient.addColorStop(0,'#fff3f9');gradient.addColorStop(.55,'#f6c9e1');gradient.addColorStop(1,'#d66da8');g.fillStyle=gradient;g.fillRect(0,0,1024,1024);
      g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.arc(300,170,510,0,Math.PI*2);g.fill();
      // A dedicated head crop fills small tray icons; the app icon uses a larger bust portrait.
      const crop=tray?{x:b.x,y:b.y,w:b.width,h:Math.round(b.height*.50)}:{x:b.x,y:b.y,w:b.width,h:Math.round(b.height*.69)};
      const width=tray?1030:890,height=width*crop.h/crop.w;
      g.drawImage(image,crop.x,crop.y,crop.w,crop.h,(1024-width)/2,tray?55:110,width,height);
      g.strokeStyle='rgba(255,255,255,.7)';g.lineWidth=tray?24:10;g.beginPath();g.roundRect(tray?24:69,tray?24:69,tray?976:886,tray?976:886,tray?488:205);g.stroke();
      return c.toDataURL('image/png').split(',')[1];
    }
    const sizes=[16,20,24,32,40,48,64,128,256,512,1024],app={},tray={};
    for(const n of sizes){app[n]=render(n,false);tray[n]=render(n,true);}
    // Show exact-size previews on both light and dark backgrounds, plus enlarged app icons.
    const p=document.createElement('canvas');p.width=760;p.height=360;const g=p.getContext('2d');
    g.fillStyle='#f3edf3';g.fillRect(0,0,760,180);g.fillStyle='#263349';g.fillRect(0,180,760,180);
    for(const [row,ink] of [[0,'#473b49'],[180,'#fff']]){
      g.fillStyle=ink;g.font='18px system-ui';g.fillText('ShadowCyrene',28,row+32);
      let x=28;for(const n of [16,20,24,32,48]){const i=new Image();i.src='data:image/png;base64,'+tray[n];await i.decode();g.drawImage(i,x,row+65,n,n);g.font='12px system-ui';g.fillText(n+'px',x,row+140);x+=90;}
      const i=new Image();i.src='data:image/png;base64,'+app[128];await i.decode();g.drawImage(i,590,row+28,128,128);
    }
    return{app,tray,preview:p.toDataURL('image/png').split(',')[1]};
  })()`);
  const png=(kind,n)=>Buffer.from(result[kind][n],'base64');
  fs.writeFileSync(path.join(resources,'icon.png'),png('app',1024));
  fs.writeFileSync(path.join(resources,'tray.png'),png('tray',20));
  fs.writeFileSync(path.join(resources,'tray@2x.png'),png('tray',40));
  fs.writeFileSync(path.join(resources,'tray-win.png'),png('tray',32));
  fs.writeFileSync(path.join(resources,'tray-win@2x.png'),png('tray',64));
  const entries=[16,24,32,48,64,128,256],header=Buffer.alloc(6);header.writeUInt16LE(1,2);header.writeUInt16LE(entries.length,4);
  let offset=6+entries.length*16;const directory=[],payload=[];
  for(const n of entries){const bytes=png('app',n),entry=Buffer.alloc(16);entry[0]=entry[1]=n===256?0:n;entry.writeUInt16LE(1,4);entry.writeUInt16LE(32,6);entry.writeUInt32LE(bytes.length,8);entry.writeUInt32LE(offset,12);directory.push(entry);payload.push(bytes);offset+=bytes.length;}
  fs.writeFileSync(path.join(resources,'icon.ico'),Buffer.concat([header,...directory,...payload]));
  const chunks=[];for(const [type,n]of [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]){const bytes=png('app',n),head=Buffer.alloc(8);head.write(type);head.writeUInt32BE(bytes.length+8,4);chunks.push(head,bytes);}
  const head=Buffer.alloc(8);head.write('icns');head.writeUInt32BE(8+chunks.reduce((n,b)=>n+b.length,0),4);fs.writeFileSync(path.join(resources,'icon.icns'),Buffer.concat([head,...chunks]));
  fs.mkdirSync(path.join(root,'docs'),{recursive:true});fs.writeFileSync(path.join(root,'docs/icons-preview.png'),Buffer.from(result.preview,'base64'));
  console.log(JSON.stringify({sourceBounds:bounds,appIcon:1024,windowsIconSizes:entries,macTray:[20,40],windowsTray:[32,64]}));
  win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
