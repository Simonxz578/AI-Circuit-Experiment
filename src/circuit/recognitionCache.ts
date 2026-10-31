import {needsReview,type CircuitDocument} from './schema';
export type Recognized={document:CircuitDocument;durationMs:number;model:string;cached?:boolean};
/** Page-memory only. No localStorage, uploaded files, or shared-server cache. */
export class RecognitionCache{
 private results=new Map<string,{at:number;value:Recognized}>();
 get(key:string):Recognized|null{const found=this.results.get(key);if(!found||Date.now()-found.at>600000){this.results.delete(key);return null;}return {...structuredClone(found.value),cached:true};}
 put(key:string,value:Recognized){const d=value.document,switches=d.components.filter(c=>c.type==='switch').length;if(needsReview(d)||(d.source==='image'&&(d.verification?.status!=='matched'||(d.verification.pixelCheckedSwitches??0)!==switches)))return;this.results.delete(key);this.results.set(key,{at:Date.now(),value:structuredClone(value)});while(this.results.size>3)this.results.delete(this.results.keys().next().value!);}
}
export async function recognitionKey(text:string,image?:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('vision-v4\n'+text.trim()+'\n'+(image??'')));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
