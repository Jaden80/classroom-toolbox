import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readExcel} from '../src/excel.ts';
import ExcelJS from 'exceljs';
import {inspectXlsxZip} from '../shared/xlsx-safety.ts';
test('실제 XLSX 템플릿을 앱 파서로 다시 읽기',async()=>{
 const buffer=await readFile(new URL('../public/문제양식.xlsx',import.meta.url));
 const file=new File([buffer],'문제양식.xlsx');const result=await readExcel(file);
 assert.equal(result.questions.length,2);assert.equal(result.questions[0].answer,'3');assert.equal(result.questions[1].type,'OX');
});
test('압축 구조 손상·과도한 해제 크기 사전 거절',async()=>{
 assert.throws(()=>inspectXlsxZip(new ArrayBuffer(10)),{code:'INVALID_FILE'});
 const source=await readFile(new URL('../public/문제양식.xlsx',import.meta.url));const copy=Uint8Array.from(source).buffer;const view=new DataView(copy);
 for(let i=0;i<copy.byteLength-46;i++){if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,30*1024*1024,true);break;}}
 assert.throws(()=>inspectXlsxZip(copy),{code:'INVALID_FILE'});
});
test('수식·하이퍼링크·잘못된 파일 확장자 거절',async()=>{
 const original=await readFile(new URL('../public/문제양식.xlsx',import.meta.url));
 for(const value of [{formula:'1+1',result:2},{text:'클릭',hyperlink:'https://example.com'}]){
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(original as any);wb.worksheets[0].getCell('C2').value=value;
  const buffer=await wb.xlsx.writeBuffer();await assert.rejects(()=>readExcel(new File([buffer as ArrayBuffer],'test.xlsx')),{code:'INVALID_FILE'});
 }
 await assert.rejects(()=>readExcel(new File([original],'test.xlsm')),{code:'INVALID_FILE'});
});
