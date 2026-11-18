'use strict';
const {spawn} = require('node:child_process');
const readline = require('node:readline');

function watchMacOverlay(executable, onChange) {
  let child;
  let retry;
  let stopped = false;

  function start() {
    const observer = spawn(executable, [], {stdio: ['pipe', 'pipe', 'ignore']});
    child = observer;
    const lines = readline.createInterface({input: observer.stdout});

    lines.on('line', line => {
      if (stopped || child !== observer) return;
      let snapshot;
      try { snapshot = JSON.parse(line); } catch { return; }
      if (typeof snapshot?.store === 'boolean') onChange(snapshot);
    });
    observer.stdin.on('error', () => {});
    function lostObserver() {
      if (stopped || child !== observer) return;
      child = undefined;
      lines.close();
      // Keep the last placement while the observer reconnects.
      retry = setTimeout(start, 2000);
      retry.unref();
    }
    observer.on('error', lostObserver);
    observer.on('close', lostObserver);
  }

  start();
  return () => {
    stopped = true;
    clearTimeout(retry);
    child?.stdin.destroy();
  };
}

module.exports = {watchMacOverlay};
