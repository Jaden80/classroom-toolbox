export function parseDuration(minutes, seconds) {
  if (!/^\d+$/.test(minutes) || !/^\d+$/.test(seconds)) throw new Error('분과 초에 0 이상의 정수를 입력해 주세요.');
  const m = Number(minutes), s = Number(seconds);
  if (m > 99 || s > 59) throw new Error('분은 0~99, 초는 0~59 사이로 입력해 주세요.');
  if (m === 0 && s === 0) throw new Error('시간을 1초 이상 설정해 주세요.');
  return (m * 60 + s) * 1000;
}
export function formatTime(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export class Timer {
  constructor(now = () => Date.now()) {
    this.now = now; this.durationMs = 300000; this.reset();
  }
  setDuration(ms) {
    if (this.status === 'running' || this.status === 'paused') return false;
    if (!Number.isInteger(ms) || ms < 1000 || ms > 5999000) throw new Error('유효하지 않은 시간입니다.');
    this.durationMs = ms; this.reset(); return true;
  }
  reset() { this.remainingMs = this.durationMs; this.deadlineMs = null; this.status = 'idle'; this.completionHandled = false; }
  start() {
    if (this.status === 'running') return false;
    if (this.status === 'finished') this.reset();
    this.deadlineMs = this.now() + this.remainingMs; this.status = 'running'; return true;
  }
  tick() {
    if (this.status !== 'running') return false;
    this.remainingMs = Math.max(0, this.deadlineMs - this.now());
    if (this.remainingMs === 0) {
      this.status = 'finished'; this.deadlineMs = null;
      if (!this.completionHandled) { this.completionHandled = true; return true; }
    }
    return false;
  }
  pause() {
    if (this.status !== 'running') return false;
    const ended = this.tick();
    if (!ended) { this.status = 'paused'; this.deadlineMs = null; }
    return ended;
  }
}
