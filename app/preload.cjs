'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('companion', {
  ready: () => ipcRenderer.invoke('ready'),
  onState: fn => ipcRenderer.on('state', (_e, value) => fn(value)),
  onCursor: fn => ipcRenderer.on('cursor', (_e, value) => fn(value)),
  onLayout: fn=>ipcRenderer.on('layout',(_e,value)=>fn(value)),
  onAction: fn => ipcRenderer.on('action', (_e, value) => fn(value)),
  regions: value => ipcRenderer.send('regions', value),
  menu: () => ipcRenderer.send('menu'),
  drag: (phase, point) => ipcRenderer.send('drag', {phase, point}),
  visibility: value => ipcRenderer.send('visibility',value),
  composerHeight: value=>ipcRenderer.send('composer-height',value),
  collapseChat: value=>ipcRenderer.send('chat-collapse',!!value),
  cancel: ()=>ipcRenderer.invoke('cancel'),
  openChat: text => ipcRenderer.invoke('chat', text),
  refresh: () => ipcRenderer.invoke('refresh'),
  action: action => ipcRenderer.send('command', action)
});
