export type CoachTurn={role:'user'|'assistant';text:string};

/** Keep only visible conversation, bounded per request; never accept system/tool roles. */
export function sanitizeCoachHistory(value:unknown):CoachTurn[]{
 if(!Array.isArray(value))return [];
 const turns:CoachTurn[]=[];let remaining=6000;
 for(const item of value.slice(-8).reverse()){
  if(!item||typeof item!=='object'||!['user','assistant'].includes(item.role)||typeof item.text!=='string')continue;
  const text=item.text.trim().slice(0,Math.min(1200,remaining));if(!text)continue;
  turns.push({role:item.role,text});remaining-=text.length;if(remaining<=0)break;
 }
 return turns.reverse();
}

const sourceIntent=/读(?:题|图|一下)|原(?:图|题|照片|图片)|题目|图片|照片|图中|图里|图上|拍的|上传的|这张|识别|给定|已知|初始|解题|解(?:一?下)?(?:这|那)?(?:一)?道?题|做题|求解|计算|算出|答案|(?:填|代入|写入).{0,12}(?:结果|数值|阻值|电压|电流|电源|[A-Za-z]\d)|(?:结果|数值|阻值|电压|电流).{0,12}(?:填|代入|写入)/;
/** Photo questions and their short follow-ups need the original, not just the drawn candidate. */
export function coachNeedsImage(text:string,history:CoachTurn[]=[]):boolean{
 if(sourceIntent.test(text))return true;
 const followup=/继续|再(?:看|读|查|核对)|刚才|上一|上面|按你|按刚才|这些|那(?:个|些|里)|它|^\s*(?:好|可以|是的|对|嗯)[的吧啊呀，。！!\s]*$/;
 return followup.test(text)&&history.filter(t=>t.role==='user').slice(-3).some(t=>sourceIntent.test(t.text));
}

/** The model may propose only edits actually requested in a positive action clause. */
export function coachAllowsEdits(text:string):boolean{
 return text.split(/[，,。；;！!\n]|然后|接着|并且/).some(clause=>{
  clause=clause.replace(/能不能/g,'能否');
  if(/为什么|为何|怎么|如何|核对|检查|验证|解释|说明|读取|读题|读图|提取|识别|告诉我|是否|是不是|对不对|对吗|会不会|会怎样|会发生|还是/.test(clause))return false;
  if(/(?:不要|不用|无需|不必|别|暂不|先别|不)[^，,。；;！!]{0,16}(?:改|设|调|填|代入|写入|添加|新增|加上|删除|移除|断开|闭合|打开|关闭|合上|更换|替换|连接|串联|并联)/.test(clause))return false;
  if(!/把|将|请|帮我|能否|能不能|可以/.test(clause)&&/了吗|了么|什么|状态|初态|初始|是.*(?:闭合|断开)/.test(clause))return false;
  return /改(?:成|为|到|接线)|设置|设为|调到|调节|调整|填入|填上|填写|填好|填进去|填到|代入|写入|添加|新增|加上|串入|并入|删除|移除|断开|闭合|打开|关闭|合上|换成|更换|替换|串联|并联|接到|连接/.test(clause)||!/核对|检查|验证|解释|读取|读题|读图|识别|原图|题目|已知|图中/.test(text)&&/[A-Za-z]\w*\s*=\s*[+-]?(?:\d|\.\d)/.test(clause);
 });
}
