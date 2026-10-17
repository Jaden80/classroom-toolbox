import test from 'node:test';
import assert from 'node:assert/strict';
import { Timer, parseDuration, formatTime } from '../js/timer.js';
test('time boundaries and invalid inputs',()=>{
 assert.equal(parseDuration('99','59'),5999000);assert.equal(parseDuration('0','1'),1000);
 for(const [m,s] of [['0','0'],['-1','0'],['1.5','0'],['1','60'],['100','0'],['','1'],['abc','1']]) assert.throws(()=>parseDuration(m,s));
});
test('pause, resume and deadline catchup',()=>{
 let now=100;const t=new Timer(()=>now);t.setDuration(3000);t.start();assert.equal(t.start(),false);now+=1200;t.pause();assert.equal(t.remainingMs,1800);now+=10000;t.tick();assert.equal(t.remainingMs,1800);t.start();now+=1799;assert.equal(t.tick(),false);assert.equal(formatTime(t.remainingMs),'00:01');now++;assert.equal(t.tick(),true);assert.equal(t.tick(),false);assert.equal(t.status,'finished');assert.equal(t.remainingMs,0);
});
test('reset cancels old deadline; settings locked while paused',()=>{
 let now=0;const t=new Timer(()=>now);t.setDuration(1000);t.start();now=500;t.pause();assert.equal(t.setDuration(2000),false);t.reset();now=2000;assert.equal(t.tick(),false);assert.equal(t.status,'idle');assert.equal(t.remainingMs,1000);
});
test('late pause completes once and long tab suspension clamps to zero',()=>{
 let now=0;const t=new Timer(()=>now);t.setDuration(1000);t.start();now=500000;assert.equal(t.pause(),true);assert.equal(t.status,'finished');assert.equal(t.tick(),false);t.start();assert.equal(t.status,'running');assert.equal(t.completionHandled,false);
});
