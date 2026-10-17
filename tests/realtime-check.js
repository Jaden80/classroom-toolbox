import { Timer } from '../js/timer.js';
const timer = new Timer(); const started = Date.now(); timer.start();
const interval = setInterval(() => { if(timer.tick()) { const elapsed = Date.now()-started; console.log(JSON.stringify({durationMs:300000,elapsedMs:elapsed,errorMs:elapsed-300000,status:timer.status,pass:Math.abs(elapsed-300000)<=1000})); clearInterval(interval); if(Math.abs(elapsed-300000)>1000)process.exitCode=1; } },100);
