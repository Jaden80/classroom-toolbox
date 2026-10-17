import ExcelJS from 'exceljs';
import {rowsToQuestions,AppError,requireValue} from '../shared/rules.ts';
import {inspectXlsxZip} from '../shared/xlsx-safety.ts';
export async function readExcel(file:File){
  requireValue(file.name.toLowerCase().endsWith('.xlsx'),'INVALID_FILE','.xlsx 파일만 등록할 수 있습니다.');
  requireValue(file.size<=2*1024*1024,'INVALID_FILE','파일은 2MiB 이하여야 합니다.');
  const buffer=await file.arrayBuffer();inspectXlsxZip(buffer);
  const wb=new ExcelJS.Workbook();
  try{await wb.xlsx.load(buffer);}catch{throw new AppError('INVALID_FILE','엑셀 파일을 읽지 못했습니다. 정상적인 XLSX 파일을 선택하세요.');}
  const sheet=wb.worksheets[0];requireValue(sheet&&sheet.name==='문제','INVALID_FILE','첫 번째 시트 이름은 문제여야 합니다.');
  requireValue(sheet.rowCount<=10001&&sheet.columnCount<=9,'INVALID_FILE','불필요한 행·열을 제거하세요. 양식의 9개 열만 사용합니다.');
  const rows:unknown[][]=[];
  sheet.eachRow({includeEmpty:true},(row,number)=>{
    const values:unknown[]=[];
    for(let col=1;col<=9;col++){
      const value=row.getCell(col).value;
      requireValue(value==null||typeof value==='string'||typeof value==='number','INVALID_FILE',`${number}행 ${col}열: 수식·하이퍼링크·개체 대신 직접 입력한 문자나 숫자를 사용하세요.`);
      values.push(typeof value==='string'?value.trim():value??'');
    }rows.push(values);
  });
  requireValue(sheet.getImages().length===0,'INVALID_FILE','이미지 문제는 지원하지 않습니다. 텍스트로 입력하세요.');
  return {questions:rowsToQuestions(rows),warning:wb.worksheets.length>1?'첫 번째 문제 시트만 읽었습니다. 다른 시트는 제외했습니다.':''};
}
