'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cliCandidates}=require('../app/platform.cjs');
test('macOS discovers the bundled CLI before external installations',()=>{
  const values=cliCandidates('darwin',{PATH:'/custom/bin'},'/Users/test','/Applications/ChatGPT.app');
  assert.equal(values[0],'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex');
  assert.ok(values.includes('/custom/bin/codex'));assert.equal(new Set(values).size,values.length);
});
test('Windows CLI discovery supports bundled, npm native vendor and PATH executables',()=>{
  const values=cliCandidates('win32',{LOCALAPPDATA:'/Local',APPDATA:'/Roaming',PATH:'/first;/second'},'/Home','/Apps/ChatGPT.exe');
  assert.ok(values.some(v=>v.endsWith('resources/codex.exe')));
  assert.ok(values.some(v=>v.includes('x86_64-pc-windows-msvc')));
  assert.ok(values.some(v=>v.endsWith('/second/codex.exe')));
});
