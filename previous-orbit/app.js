const $ = id => document.getElementById(id);
let level='easy', score=0, combo=0, correct=0, attempts=0, answer=0, deadline=0, ticker=null, active=false;
let best=0;
try { best=Number(localStorage.getItem('orbit-best'))||0; } catch {}
$('best').textContent=best;
document.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>{
  level=button.dataset.level;
  document.querySelectorAll('[data-level]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
}));
function show(view){['intro','game','result'].forEach(id=>$(id).hidden=id!==view);document.body.classList.toggle('playing',view==='game');$('how').hidden=view!=='intro';}
const random = max => Math.floor(Math.random()*max)+1;
function nextQuestion(){
  let a=random(level==='easy'?10:20), b=random(level==='easy'?10:20);
  const op=random(level==='easy'?2:3);
  if(op===2 && a<b) [a,b]=[b,a];
  if(op===3){a=random(9);b=random(9);}
  answer=op===1?a+b:op===2?a-b:a*b;
  $('question').textContent=`${a} ${op===1?'+':op===2?'−':'×'} ${b} = ?`;
  $('answer').value='';$('answer').focus();
}
function start(){
  clearInterval(ticker);score=combo=correct=attempts=0;active=true;deadline=performance.now()+30000;
  $('score').textContent='0';$('combo').textContent='0';$('time').innerHTML='30<span>초</span>';$('timer-bar').style.width='100%';
  $('feedback').textContent='숫자를 입력하고 Enter를 누르세요.';show('game');nextQuestion();
  ticker=setInterval(()=>{const remaining=Math.max(0,deadline-performance.now());$('time').innerHTML=`${Math.ceil(remaining/1000)}<span>초</span>`;$('timer-bar').style.width=`${remaining/300}%`;if(remaining===0) finish();},100);
}
function finish(){
  if(!active)return;active=false;clearInterval(ticker);
  best=Math.max(best,score);try{localStorage.setItem('orbit-best',String(best));}catch{}
  $('best').textContent=best;$('final-score').textContent=score;
  $('summary').textContent=`${attempts}문제 중 ${correct}개 정답 · 정답률 ${attempts?Math.round(correct/attempts*100):0}%`;
  show('result');$('again').focus();
}
$('answer-form').addEventListener('submit',event=>{
  event.preventDefault();if(!active)return;if(performance.now()>=deadline){finish();return;}
  const value=$('answer').value.trim();if(!/^\d+$/.test(value)){$('feedback').textContent='0 이상의 정수를 입력해 주세요.';return;}
  attempts++;
  if(Number(value)===answer){correct++;combo++;const bonus=combo%3===0?5:0;score+=10+bonus;$('feedback').textContent=bonus?'✦ 3연속 정답! +15점':'✦ 정답이에요! +10점';}
  else{combo=0;$('feedback').textContent=`정답은 ${answer}였어요. 다음 별을 찾아봐요!`;}
  $('score').textContent=score;$('combo').textContent=combo;nextQuestion();
});
$('start').addEventListener('click',start);$('again').addEventListener('click',start);$('quit').addEventListener('click',finish);$('home').addEventListener('click',()=>{show('intro');$('start').focus();});
// Procedural triangular constellation. No external assets or network requests.
const canvas=$('stars'),ctx=canvas.getContext('2d'),colors=['#8052ff','#ffb829','#15846e','#b752d9','#4685e9'];
let points=[],width=0,height=0;
function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);points=[];
  for(let i=0;i<1150;i++){const t=Math.random()*Math.PI*2,u=Math.random()*2-1,r=Math.sqrt(1-u*u),phi=.5+Math.random()*.5;points.push({x:Math.cos(t)*r*phi,y:u*phi,z:Math.sin(t)*r*phi,size:.6+Math.random()*1.8,color:colors[i%5],phase:Math.random()*6.28});}
}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function draw(now){ctx.clearRect(0,0,width,height);const rotation=reduced?.3:now*.000055,scale=Math.min(width*.39,height*.36);
  for(const p of points){const x=p.x*Math.cos(rotation)+p.z*Math.sin(rotation),z=-p.x*Math.sin(rotation)+p.z*Math.cos(rotation);const shape=1+.12*Math.sin(p.y*8);const px=width*.58+x*scale*shape,py=height*.45+p.y*scale*1.04;ctx.globalAlpha=.25+(z+1)*.3;ctx.strokeStyle=p.color;ctx.lineWidth=.65;const s=p.size;ctx.beginPath();ctx.moveTo(px,py-s);ctx.lineTo(px+s*.85,py+s*.6);ctx.lineTo(px-s*.85,py+s*.6);ctx.closePath();ctx.stroke();}
  ctx.globalAlpha=1;if(!reduced)requestAnimationFrame(draw);
}
window.addEventListener('resize',()=>{resize();if(reduced)draw(0);});resize();requestAnimationFrame(draw);
