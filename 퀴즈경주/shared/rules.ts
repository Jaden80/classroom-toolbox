export type Question = {ordinal:number; type:'객관식'|'OX'; prompt:string; options:string[]; answer:string; explanation:string};
export const HEADERS = ['번호','유형','문제','보기1','보기2','보기3','보기4','정답','해설'];
export class AppError extends Error {
  code:string; status:number;
  constructor(code:string,message:string,status=400){super(message);this.code=code;this.status=status;}
}
export function requireValue(ok:unknown,code:string,message:string,status=400):asserts ok {
  if(!ok)throw new AppError(code,message,status);
}
export function text(value:unknown,max=1000){return typeof value==='string'?value.trim().slice(0,max+1):'';}
export function validateQuestions(input:unknown):Question[]{
  requireValue(Array.isArray(input)&&input.length>=1&&input.length<=100,'INVALID_FILE','문제는 1~100개여야 합니다.');
  const result=input.map((raw:any,i:number)=>{
    const row=i+2;const fail=(column:string,msg:string)=>{throw new AppError('INVALID_FILE',`${row}행 ${column}: ${msg}`);};
    if(!raw||typeof raw!=='object')fail('문제','올바른 문제 형식이 아닙니다.');
    if(!Number.isInteger(raw.ordinal)||raw.ordinal<1)fail('번호','1부터 시작하는 정수를 입력하세요.');
    if(!['객관식','OX'].includes(raw.type))fail('유형','객관식 또는 OX를 입력하세요.');
    const prompt=text(raw.prompt),explanation=text(raw.explanation),answer=text(raw.answer,10);
    if(!prompt||prompt.length>1000)fail('문제','1~1,000자로 입력하세요.');
    if(!explanation||explanation.length>1000)fail('해설','1~1,000자로 입력하세요.');
    if(!Array.isArray(raw.options))fail('보기','보기 형식이 올바르지 않습니다.');
    const options=raw.options.map((v:unknown)=>text(v,200));
    if(raw.type==='객관식'){
      if(options.length!==4||options.some((v:string)=>!v||v.length>200))fail('보기1~4','보기 4개를 각각 1~200자로 입력하세요.');
      if(!['1','2','3','4'].includes(answer))fail('정답','정답 보기 번호 1~4를 입력하세요.');
    }else{
      if(options.some(Boolean))fail('보기1~4','OX 문제의 보기 칸은 비워 주세요.');
      if(!['O','X'].includes(answer))fail('정답','영문 O 또는 X를 입력하세요.');
    }
    return {ordinal:raw.ordinal,type:raw.type,prompt,options:raw.type==='OX'?[]:options,answer,explanation} as Question;
  }).sort((a,b)=>a.ordinal-b.ordinal);
  result.forEach((q,i)=>requireValue(q.ordinal===i+1,'INVALID_FILE','번호: 중복·누락 없이 1부터 연속해서 입력하세요.'));
  return result;
}
export function rowsToQuestions(rows:unknown[][]){
  requireValue(rows.length>=2,'INVALID_FILE','헤더와 문제를 입력하세요.');
  requireValue(HEADERS.every((h,i)=>rows[0][i]===h)&&rows[0].slice(9).every(v=>v==null||v===''),'INVALID_FILE','첫 행의 열은 번호, 유형, 문제, 보기1, 보기2, 보기3, 보기4, 정답, 해설 순서여야 합니다.');
  const data=rows.slice(1).filter(r=>r.some(v=>v!==null&&v!==undefined&&v!==''));
  return validateQuestions(data.map(r=>({ordinal:Number(r[0]),type:r[1],prompt:r[2],options:r.slice(3,7).map(v=>v==null?'':String(v)),answer:r[7]==null?'':String(r[7]),explanation:r[8]})));
}
export type RankedTeam={id:string;name:string;lane:number;score:number;answered:number;finishedAt:number|null;elapsed:number;rank:number};
export function rankTeams<T extends {id:string;score:number;elapsed:number}>(teams:T[]):(T&{rank:number})[]{
  const list=[...teams].sort((a,b)=>b.score-a.score||a.elapsed-b.elapsed||a.id.localeCompare(b.id));
  let rank=0;return list.map((t,i)=>{if(!i||t.score!==list[i-1].score||t.elapsed!==list[i-1].elapsed)rank=i+1;return {...t,rank};});
}
export function position(score:number,total:number){return total>0?Math.max(0,Math.min(1,score/total)):0;}
export function formatTime(ms:number){const value=Math.max(0,Math.floor(ms)),s=Math.floor(value/1000);return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}.${(value%1000).toString().padStart(3,'0')}`;}
export const SAMPLE:Question[]=[
  {ordinal:1,type:'객관식',prompt:'2 + 3의 값은 얼마인가요?',options:['3','4','5','6'],answer:'3',explanation:'2에 3을 더하면 5입니다.'},
  {ordinal:2,type:'OX',prompt:'삼각형의 변은 3개이다.',options:[],answer:'O',explanation:'삼각형은 세 개의 변과 세 개의 꼭짓점으로 이루어집니다.'},
  {ordinal:3,type:'객관식',prompt:'식물이 광합성을 할 때 필요한 것은 무엇인가요?',options:['햇빛','플라스틱','소금','모래만'],answer:'1',explanation:'식물은 빛 에너지를 이용하여 양분을 만듭니다.'},
  {ordinal:4,type:'OX',prompt:'1시간은 100분이다.',options:[],answer:'X',explanation:'1시간은 60분입니다.'},
  {ordinal:5,type:'객관식',prompt:'다음 중 물이 얼었을 때의 상태는 무엇인가요?',options:['기체','액체','고체','빛'],answer:'3',explanation:'얼음은 물의 고체 상태입니다.'},
  {ordinal:6,type:'OX',prompt:'다른 모둠의 의견을 듣고 존중하는 것은 좋은 협력 방법이다.',options:[],answer:'O',explanation:'서로의 생각을 존중하면 함께 더 좋은 답을 찾을 수 있습니다.'}
];
