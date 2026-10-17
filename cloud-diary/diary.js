import {auth,login,logout,onAuthStateChanged} from './firebase-client.js';
import {diaryApi} from './cloud-store.js';
const $=id=>document.getElementById(id);let entries=[],current=null,dirty=false,busy=false;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const api=diaryApi;

function render(){const q=$('search').value.toLocaleLowerCase();$('entries').replaceChildren();$('count').textContent=entries.length;const filtered=entries.filter(e=>(e.title+' '+e.content).toLocaleLowerCase().includes(q));if(!filtered.length)$('entries').textContent=q?'검색 결과가 없어요.':'아직 기록이 없어요. 첫 하루를 남겨보세요.';for(const e of filtered){const b=document.createElement('button');b.type='button';b.className='entry';b.setAttribute('aria-current',String(e.id===current));const date=document.createElement('span'),title=document.createElement('strong'),preview=document.createElement('p');date.textContent=e.date+' · '+e.mood;title.textContent=e.title;preview.textContent=e.content;b.append(date,title,preview);b.onclick=()=>{if(!busy&&canLeave())edit(e);};$('entries').append(b);}}
function canLeave(){return !dirty||confirm('저장하지 않은 내용이 있어요. 내용을 버리고 이동할까요?');}
function edit(e){current=e?.id??null;$('date').value=e?.date??today();$('title').value=e?.title??'';$('mood').value=e?.mood??'평온';$('content').value=e?.content??'';$('delete').hidden=!current;dirty=false;$('status').textContent='';count();render();}
function count(){$('length').textContent=Array.from($('content').value).length.toLocaleString()+'자';}
function lock(v){busy=v;for(const el of $('form').elements)el.disabled=v;$('new').disabled=v;$('logout').disabled=v;}
$('form').oninput=()=>{dirty=true;count();};$('search').oninput=render;$('new').onclick=()=>{if(canLeave()){edit(null);$('title').focus();}};
$('form').onsubmit=async event=>{event.preventDefault();if(busy)return;lock(true);try{const entry=await api(current?'/'+current:'',current?'PUT':'POST',Object.fromEntries(['date','title','mood','content'].map(k=>[k,$(k).value])));entries=entries.filter(e=>e.id!==entry.id);entries.push(entry);entries.sort((a,b)=>b.date.localeCompare(a.date)||b.updated.localeCompare(a.updated));edit(entry);$('status').textContent='저장했어요. 내 계정의 비공개 일기장에 기록되었습니다.';}catch(e){$('status').textContent='저장 실패: '+e.message;}finally{lock(false);}};
$('delete').onclick=async()=>{if(busy||!current||!confirm('이 일기를 영구 삭제할까요?'))return;lock(true);try{await api('/'+current,'DELETE');entries=entries.filter(e=>e.id!==current);edit(null);$('status').textContent='일기를 삭제했어요.';}catch(e){$('status').textContent=e.message;}finally{lock(false);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});document.querySelector('header a').onclick=e=>{if(!canLeave())e.preventDefault();else dirty=false;};
let generation=0;
$('google-login').onclick=async()=>{if(busy)return;try{$('auth-status').textContent='Google 로그인 창에서 계정을 선택해 주세요.';await login();}catch(error){$('auth-status').textContent=error.code==='auth/popup-blocked'?'팝업이 차단되었어요. 브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.':error.code==='auth/popup-closed-by-user'?'로그인이 취소되었습니다.':'로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';}};
$('logout').onclick=async()=>{if(busy||!canLeave())return;dirty=false;try{await logout();}catch{$('auth-status').textContent='로그아웃하지 못했습니다. 다시 시도해 주세요.';}};
onAuthStateChanged(auth,async user=>{const run=++generation;entries=[];edit(null);$('workspace').hidden=!user;$('google-login').hidden=!!user;$('logout').hidden=!user;$('auth-user').textContent=user?'내 계정으로 로그인했습니다.':'Google 계정으로 로그인하면 나만의 일기를 이어서 볼 수 있어요.';$('auth-status').textContent='';
 if(!user)return;lock(true);try{const data=await api();if(run!==generation)return;entries=data;render();}catch{$('status').textContent='일기를 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.';}finally{if(run===generation)lock(false);}
});
edit(null);
