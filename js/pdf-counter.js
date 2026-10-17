import { countText, pageText } from './pdf-counts.js';
const $ = id => document.getElementById(id);
let generation = 0, active = null;
async function asset(folder, name) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Invalid asset');
  const { default: encoded } = await import(`../vendor/pdfjs/${folder}/${name}.mjs`);
  return Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
}
class LocalCMaps {
  async fetch({ name }) { return { cMapData: await asset('cmaps', name + '.bcmap'), compressionType: 1 }; }
}
class LocalFonts {
  async fetch({ filename }) { return asset('standard_fonts', filename); }
}
export function clearPdf() {
  generation++;
  if (active) { void active.destroy().catch(() => {}); active = null; }
  $('pdf-file').value = ''; $('pdf-results').hidden = true;
  $('pdf-text').value = ''; $('pdf-rows').replaceChildren();
  $('pdf-error').textContent = ''; $('pdf-warning').textContent = '';
  for (const id of ['pdf-with', 'pdf-without', 'pdf-pages']) $(id).textContent = '0';
  $('pdf-status').textContent = '컴퓨터에서 PDF 파일을 선택해 주세요.';
}
$('pdf-clear').addEventListener('click', clearPdf);
$('pdf-file').addEventListener('change', async () => {
  let file = $('pdf-file').files[0];
  clearPdf();
  if (!file) return;
  const mine = generation;
  let task;
  try {
    if (!/\.pdf$/i.test(file.name)) throw new Error('PDF 파일을 선택해 주세요.');
    if (file.size > 50 * 1024 * 1024) throw new Error('50MB 이하의 PDF를 선택해 주세요.');
    const filename = file.name;
    $('pdf-status').textContent = `${filename} · 준비 중…`;
    const data = new Uint8Array(await file.arrayBuffer()); file = null;
    if (mine !== generation) return;
    const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    if (mine !== generation) return;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    task = pdfjs.getDocument({ data, CMapReaderFactory: LocalCMaps, StandardFontDataFactory: LocalFonts, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, stopAtErrors: true });
    active = task;
    const pdf = await task.promise;
    const rows = [], texts = [];
    let withSpaces = 0, withoutSpaces = 0, empty = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      if (mine !== generation) return;
      $('pdf-status').textContent = `${filename} · ${n} / ${pdf.numPages}쪽 처리 중…`;
      const page = await pdf.getPage(n);
      const text = pageText((await page.getTextContent()).items);
      const counts = countText(text);
      withSpaces += counts.withSpaces; withoutSpaces += counts.withoutSpaces;
      if (!counts.withoutSpaces) empty++;
      rows.push([n, counts.withSpaces, counts.withoutSpaces]); texts.push(text); page.cleanup();
    }
    if (mine !== generation) return;
    $('pdf-with').textContent = withSpaces.toLocaleString('ko');
    $('pdf-without').textContent = withoutSpaces.toLocaleString('ko');
    $('pdf-pages').textContent = pdf.numPages.toLocaleString('ko');
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const value of row) { const td = document.createElement('td'); td.textContent = value.toLocaleString('ko'); tr.append(td); }
      fragment.append(tr);
    }
    $('pdf-rows').replaceChildren(fragment); $('pdf-text').value = texts.join('\n\n');
    $('pdf-warning').textContent = empty ? `${empty}쪽에서 글자를 추출하지 못했어요. 빈 페이지 또는 스캔·사진일 수 있으며 해당 쪽은 0자로 계산했어요.` : '';
    $('pdf-results').hidden = false; $('pdf-status').textContent = `${filename} · 계산 완료`;
  } catch (error) {
    if (mine !== generation) return;
    $('pdf-status').textContent = '계산을 완료하지 못했어요.';
    $('pdf-error').textContent = error.name === 'PasswordException' ? '암호가 걸린 PDF예요. 암호를 해제한 파일을 선택해 주세요.' : ['InvalidPDFException', 'UnknownErrorException'].includes(error.name) ? '손상되었거나 지원하지 않는 PDF예요. 다른 PDF로 다시 시도해 주세요.' : error.message === 'PDF 파일을 선택해 주세요.' || error.message === '50MB 이하의 PDF를 선택해 주세요.' ? error.message : 'PDF를 읽지 못했어요. 최신 Chrome 또는 Edge에서 다른 PDF로 다시 시도해 주세요.';
  } finally {
    file = null;
    if (active === task) active = null;
    if (task) await task.destroy().catch(() => {});
  }
});
