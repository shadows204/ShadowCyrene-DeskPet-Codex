'use strict';
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function buildObserver(destination, arch) {
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  execFileSync('/usr/bin/xcrun', [
    'clang', '-fobjc-arc', '-O2', '-arch', arch,
    '-mmacosx-version-min=12.0', '-framework', 'AppKit', '-framework', 'CoreGraphics',
    path.join(__dirname, '../native/foreground-app.m'), '-o', destination,
  ], {stdio: 'inherit'});
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const arch = require('builder-util').Arch[context.arch];
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  buildObserver(path.join(app, 'Contents/Helpers/foreground-app'), arch === 'x64' ? 'x86_64' : arch);
};

if (require.main === module && process.platform === 'darwin') {
  buildObserver(path.join(__dirname, '../dist/dev/foreground-app'), process.arch === 'x64' ? 'x86_64' : process.arch);
}
