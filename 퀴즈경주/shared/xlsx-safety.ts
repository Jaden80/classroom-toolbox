import {requireValue} from './rules.ts';
// Read ZIP metadata before invoking an XML/XLSX parser. No file extraction or URL loading.
export function inspectXlsxZip(buffer:ArrayBuffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(view.getUint32(p,true)===0x06054b50){end=p;break;}}
 requireValue(end>=0,'INVALID_FILE','정상적인 XLSX 파일이 아닙니다.');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
 requireValue(count>0&&count<=2048&&offset<end,'INVALID_FILE','엑셀 내부 구조가 허용 범위를 넘었습니다.');
 let cursor=offset,total=0;const names:string[]=[];
 for(let i=0;i<count;i++){
  requireValue(cursor+46<=end&&view.getUint32(cursor,true)===0x02014b50,'INVALID_FILE','엑셀 내부 구조를 확인할 수 없습니다.');
  const size=view.getUint32(cursor+24,true),length=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true);
  total+=size;requireValue(total<=20*1024*1024,'INVALID_FILE','압축 해제 후 파일이 너무 큽니다. 불필요한 내용을 제거해 주세요.');
  requireValue(cursor+46+length+extra+comment<=end,'INVALID_FILE','엑셀 파일 일부가 손상되었습니다.');
  const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+length));names.push(name);
  requireValue(!/vbaProject|externalLinks|embeddings/i.test(name),'INVALID_FILE','매크로·외부 통합문서 링크·삽입 개체는 지원하지 않습니다.');
  cursor+=46+length+extra+comment;
 }
 requireValue(names.includes('xl/workbook.xml'),'INVALID_FILE','통합문서를 찾을 수 없습니다.');
}
