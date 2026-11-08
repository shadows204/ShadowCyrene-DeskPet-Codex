(() => {
'use strict';
const TAU = Math.PI * 2;
function directionIndex(dx, dy, previous = null) {
  if (Math.hypot(dx, dy) < 22) return null;
  const a = (Math.atan2(dx, -dy) + TAU) % TAU;
  // Small hysteresis prevents alternating poses at sector boundaries.
  if (previous !== null) {
    const center = previous * TAU / 16;
    const delta = Math.abs(Math.atan2(Math.sin(a - center), Math.cos(a - center)));
    if (delta < TAU / 32 + 0.035) return previous;
  }
  return Math.round(a / TAU * 16) % 16;
}
function clampPosition(pos, workArea, size) {
  return {
    x: Math.round(Math.max(workArea.x, Math.min(pos.x, workArea.x + workArea.width - size.width))),
    y: Math.round(Math.max(workArea.y, Math.min(pos.y, workArea.y + workArea.height - size.height)))
  };
}
function windowValue(w) {
  if (!w || !Number.isFinite(w.usedPercent) || !Number.isFinite(w.windowDurationMins)) return null;
  return {remaining: Math.max(0, Math.min(100, 100 - w.usedPercent)), minutes: w.windowDurationMins,
    resetsAt: Number.isFinite(w.resetsAt) ? w.resetsAt : null};
}
function gazeTarget(dx,dy) {
  const gain=Math.min(1,Math.hypot(dx,dy)/24);
  return {x:Math.tanh(dx/240)*gain,y:Math.tanh(dy/190)*gain};
}
function smoothGaze(current,target,dt,tau=95) {
  const amount=1-Math.exp(-Math.max(0,Math.min(dt,80))/tau);
  return {x:current.x+(target.x-current.x)*amount,y:current.y+(target.y-current.y)*amount};
}
function dragRunPose(previous={},input={},dt=16.7){
  if(!input.active)return {speed:0,vx:0,vy:0,phase:0,direction:previous.direction||1,running:false,fps:0,row:0,column:0};
  const scale=Number.isFinite(input.scale)?Math.max(.25,input.scale):1;
  const a=1-Math.exp(-Math.max(0,Math.min(dt,80))/55);
  const rawX=(Number.isFinite(input.vx)?input.vx:0)/scale,rawY=(Number.isFinite(input.vy)?input.vy:0)/scale;
  const vx=(previous.vx||0)+(rawX-(previous.vx||0))*a,vy=(previous.vy||0)+(rawY-(previous.vy||0))*a;
  const speed=(previous.speed||0)+(Math.hypot(rawX,rawY)-(previous.speed||0))*a;
  const direction=rawX>35?1:rawX< -35?-1:previous.direction||1;
  const running=speed>(previous.running?12:28),fps=running?Math.max(8,Math.min(18,speed/18)):0;
  const phase=running?((previous.phase||0)+Math.min(dt,80)*fps/1000)%8:previous.phase||0;
  return {vx,vy,speed,direction,running,fps,phase,row:running?(direction>0?1:2):0,column:running?Math.floor(phase)%8:0};
}
function quotaView(payload, accountPlan, selectedID = 'codex') {
  const byID = payload?.rateLimitsByLimitId;
  const buckets = byID && Object.keys(byID).length ? byID : payload?.rateLimits ? {[payload.rateLimits.limitId || 'codex']: payload.rateLimits} : {};
  const ids = Object.keys(buckets);
  const id = buckets[selectedID] ? selectedID : buckets.codex ? 'codex' : ids[0];
  const bucket = buckets[id] || {};
  const plan = String(bucket.planType || accountPlan || 'unknown').toLowerCase();
  const pro = /^pro($|[_\s-])/.test(plan);
  const windows = [windowValue(bucket.primary), windowValue(bucket.secondary)].filter(Boolean);
  return {plan, id: id || 'codex', name: bucket.limitName || id || 'Codex / Work', ids,
    fiveHour: windows.find(w => w.minutes === 300) || null,
    weekly: windows.find(w => w.minutes === 10080) || null,
    fiveHourNotApplicable: pro && windows.length > 0 && !windows.some(w => w.minutes === 300),
    extra: windows.filter(w => w.minutes !== 300 && w.minutes !== 10080)};
}
// Six existing poses, independently clocked. No multi-second closed-eye hold.
const BLINK_SEQUENCE = [1, 2, 3, 2, 4, 5];
const BLINK_DURATIONS = [25, 45, 45, 45, 25, 25];
function blinkFrame(elapsedMs) {
  let left = elapsedMs;
  for (let i = 0; i < BLINK_DURATIONS.length; i++) {
    if (left < BLINK_DURATIONS[i]) return BLINK_SEQUENCE[i];
    left -= BLINK_DURATIONS[i];
  }
  return null;
}
const api = {directionIndex, gazeTarget, smoothGaze, dragRunPose, clampPosition, quotaView, windowValue, blinkFrame, BLINK_DURATIONS};
if (typeof module !== 'undefined') module.exports = api;
else window.ShadowCyreneCore = api;
})();
