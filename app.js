import { clearPdf } from './js/pdf-counter.js';
import { tools } from './js/tools.js';
import { Timer, parseDuration, formatTime } from './js/timer.js';
const $ = id => document.getElementById(id);
const timer = new Timer();
let currentRoute = '', muted = false, audio = null, soundNodes = [], expanded = false;
const announce = message => { $('announcement').textContent = message; };
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); $('main').focus(); });
function stopSound() { for (const node of soundNodes) { try { node.stop(); } catch {} } soundNodes = []; }
async function prepareAudio() {
  if (muted) return;
  try { audio ??= new AudioContext(); await audio.resume(); }
  catch { $('notice').textContent = '소리를 사용할 수 없어요. 화면으로 종료를 알려드릴게요.'; }
}
function playSound() {
  if (muted) return;
  if (!audio || audio.state !== 'running') { $('notice').textContent = '소리가 차단되었어요. 화면의 종료 안내를 확인해 주세요.'; return; }
  try {
    [660, 880, 990].forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + index * .22;
      oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.12, at + .02); gain.gain.exponentialRampToValueAtTime(.001, at + .20);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .21); soundNodes.push(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); soundNodes = soundNodes.filter(node => node !== oscillator); };
    });
  } catch { $('notice').textContent = '소리를 재생할 수 없어요. 시간이 끝났어요.'; }
}
function completed() { announce('시간이 끝났어요.'); playSound(); }
function render() {
  const status = timer.status, locked = status === 'running' || status === 'paused';
  $('digits').textContent = formatTime(timer.remainingMs);
  const [m, s] = formatTime(timer.remainingMs).split(':').map(Number);
  $('digits').setAttribute('aria-label', `남은 시간 ${m}분 ${s}초`);
  $('settings').disabled = locked;
  $('state-label').textContent = { idle: '준비되었어요', running: '함께 집중하고 있어요', paused: '잠시 쉬고 있어요', finished: '활동이 끝났어요' }[status];
  $('finish-message').textContent = status === 'finished' ? '시간이 끝났어요. 수고했어요!' : status === 'paused' ? '숨을 고르고, 다시 시작해요.' : '우리의 작은 몰입을 응원해요.';
  $('toggle').textContent = { idle: '시작하기 ▷', running: '일시정지 Ⅱ', paused: '계속하기 ▷', finished: '다시 시작 ▷' }[status];
  $('timer-stage').dataset.state = status;
}
function validate() {
  try {
    const duration = parseDuration($('minutes').value, $('seconds').value);
    $('input-error').textContent = ''; ['minutes','seconds'].forEach(id => $(id).removeAttribute('aria-invalid'));
    timer.setDuration(duration);
    document.querySelectorAll('[data-minutes]').forEach(button => button.setAttribute('aria-pressed', String(duration === Number(button.dataset.minutes) * 60000)));
    return true;
  } catch (error) {
    $('input-error').textContent = error.message; ['minutes','seconds'].forEach(id => $(id).setAttribute('aria-invalid', 'true')); return false;
  }
}
$('timer-form').addEventListener('submit', event => {
  event.preventDefault();
  if (timer.status === 'running') { if (timer.pause()) completed(); else announce('타이머를 일시정지했어요.'); }
  else {
    if ((timer.status === 'idle' || timer.status === 'finished') && !validate()) return;
    stopSound(); void prepareAudio(); timer.start(); announce('타이머를 시작했어요.');
  }
  render();
});
for (const id of ['minutes','seconds']) $(id).addEventListener('input', () => { if (timer.status === 'running' || timer.status === 'paused') return; stopSound(); if (validate()) render(); });
document.querySelectorAll('[data-minutes]').forEach(button => button.addEventListener('click', () => {
  $('minutes').value = button.dataset.minutes; $('seconds').value = '0'; stopSound(); validate(); render();
}));
$('reset').addEventListener('click', () => {
  stopSound(); timer.reset(); $('minutes').value = String(Math.floor(timer.durationMs / 60000)); $('seconds').value = String(timer.durationMs / 1000 % 60); validate(); $('notice').textContent = ''; render(); announce('설정한 시간으로 초기화했어요.');
});
$('mute').addEventListener('click', () => {
  muted = !muted; $('mute').setAttribute('aria-pressed', String(muted)); $('mute').textContent = muted ? '종료음 꺼짐' : '종료음 켜짐';
  if (muted) stopSound(); else void prepareAudio();
});
function syncFullscreen() {
  expanded = Boolean(document.fullscreenElement) || $('timer-stage').classList.contains('expanded');
  $('fullscreen').textContent = expanded ? '확대 종료 ↙' : '전체화면 ↗'; $('fullscreen').setAttribute('aria-pressed', String(expanded));
}
async function leaveFullscreen() {
  $('timer-stage').classList.remove('expanded');
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
  if ($('notice').textContent.startsWith('전체화면을')) $('notice').textContent = '';
  syncFullscreen();
}
$('fullscreen').addEventListener('click', async () => {
  if (expanded) { await leaveFullscreen(); return; }
  try { if (!$('timer-stage').requestFullscreen) throw new Error(); await $('timer-stage').requestFullscreen(); }
  catch { if (currentRoute !== '#/timer') return; $('timer-stage').classList.add('expanded'); $('notice').textContent = '전체화면을 사용할 수 없어 화면 안에서 확대했어요. 확대 종료 또는 Esc로 돌아가세요.'; }
  syncFullscreen();
});
document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.fullscreenElement) void leaveFullscreen(); });
function route() {
  const target = location.hash || '#/';
  if (target !== currentRoute && currentRoute === '#/timer' && ['running','paused'].includes(timer.status)) {
    if (!window.confirm('타이머를 종료하고 도구함으로 이동할까요?')) { history.replaceState(null, '', '#/timer'); return; }
  }
  if (target !== '#/timer') { stopSound(); timer.reset(); void leaveFullscreen(); }
  if (currentRoute === '#/pdf' && target !== '#/pdf') clearPdf();
  currentRoute = target;
  $('hub').hidden = ['#/timer','#/pdf'].includes(target); $('timer').hidden = target !== '#/timer'; $('pdf').hidden = target !== '#/pdf';
  document.title = target === '#/pdf' ? 'PDF 글자 수 · 교실 도구함' : target === '#/timer' ? '교실 타이머 · 교실 도구함' : '교실 도구함';
  if (!['#/','#/timer','#/pdf'].includes(target)) { announce('없는 도구예요. 도구함으로 돌아왔어요.'); history.replaceState(null, '', '#/'); currentRoute = '#/'; }
  render(); requestAnimationFrame(() => { (target === '#/pdf' ? $('pdf-title') : target === '#/timer' ? $('timer-title') : $('hub-title')).focus({ preventScroll: true }); window.scrollTo(0, 0); });
}
for (const tool of tools) {
  const link = document.createElement('a'); link.className = 'tool'; link.href = tool.route;
  if (tool.newWindow) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  for (const [className, text] of [['tool-number', tool.number],['tool-label',tool.label],['tool-name',tool.name],['tool-description',tool.description],['tool-arrow','↗']]) {
    const span = document.createElement('span'); span.className = className; span.textContent = text; if (className === 'tool-arrow') span.setAttribute('aria-hidden','true'); link.append(span);
  }
  $('tool-list').append(link);
}
$('tool-count').textContent = `${String(tools.length).padStart(2, '0')} TOOLS`;
if (!tools.length) $('tool-list').textContent = '등록된 도구가 없습니다.';
// Static procedural constellation: no animation, external assets, or distraction during lessons.
for (let i = 0; i < 120; i++) {
  const particle = document.createElement('i');
  // CSS rules generated into a same-origin stylesheet keep CSP free of inline styles.
  particle.className = `particle p${i}`; document.querySelector('.orb').append(particle);
}
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', event => { if (['running','paused'].includes(timer.status)) { event.preventDefault(); event.returnValue = ''; } });
function update() {
  if (currentRoute !== '#/timer' || timer.status !== 'running') return;
  const before = formatTime(timer.remainingMs);
  if (timer.tick()) { completed(); render(); }
  else if (before !== formatTime(timer.remainingMs)) render();
}
setInterval(update, 100); document.addEventListener('visibilitychange', update); window.addEventListener('pageshow', update);
route();
