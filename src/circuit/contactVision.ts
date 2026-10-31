export type ContactRaster={width:number;height:number;bits:string};
export type ContactRegion={x:number;y:number;width:number;height:number};
export type ContactCandidate={pivot:{x:number;y:number};region:ContactRegion};
export type ContactEvidence={contact:'gap'|'touching'|'unclear';reason:string;pivotKey?:string};
export function contactRaster(rgba:Uint8Array|Uint8ClampedArray,width:number,height:number):ContactRaster{
 const packed=new Uint8Array(Math.ceil(width*height/8));for(let i=0;i<width*height;i++){const at=i*4;if(rgba[at+3]>180&&rgba[at]*.299+rgba[at+1]*.587+rgba[at+2]*.114<125)packed[i>>3]|=1<<(i&7);}
 let binary='';for(let i=0;i<packed.length;i+=16384)binary+=String.fromCharCode(...packed.subarray(i,i+16384));return {width,height,bits:btoa(binary)};
}
export function validContactRaster(input:unknown):input is ContactRaster{
 if(!input||typeof input!=='object')return false;const r=input as ContactRaster;
 if(!Number.isInteger(r.width)||!Number.isInteger(r.height)||r.width<1||r.height<1||r.width>1200||r.height>1200||typeof r.bits!=='string'||r.bits.length>240000||!/^[A-Za-z0-9+/]+={0,2}$/.test(r.bits))return false;
 try{return atob(r.bits).length===Math.ceil(r.width*r.height/8);}catch{return false;}
}
const unclear=(reason:string):ContactEvidence=>({contact:'unclear',reason});

/** A small schematic patch must contain one hollow pivot and two opposing terminal rails. */
export function inspectContact(raster:ContactRaster,region:ContactRegion):ContactEvidence{
 if(!validContactRaster(raster))return unclear('invalid-raster');
 const pad=.06,x=Math.max(0,Math.floor((region.x-region.width*pad)*raster.width/1000)),y=Math.max(0,Math.floor((region.y-region.height*pad)*raster.height/1000));
 const right=Math.min(raster.width,Math.ceil((region.x+region.width*(1+pad))*raster.width/1000)),bottom=Math.min(raster.height,Math.ceil((region.y+region.height*(1+pad))*raster.height/1000)),w=right-x,h=bottom-y;
 if(w<20||h<15||w>raster.width*.42||h>raster.height*.42||w*h>160000)return unclear('region-not-local');
 const binary=atob(raster.bits),dark=new Uint8Array(w*h);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const p=(y+yy)*raster.width+x+xx;dark[yy*w+xx]=(binary.charCodeAt(p>>3)>>(p&7))&1;}
 const seen=new Uint8Array(w*h),holes:{x:number;y:number;w:number;h:number;area:number}[]=[],queue=new Int32Array(w*h);
 for(let at=0;at<dark.length;at++){if(dark[at]||seen[at])continue;let head=0,tail=1;queue[0]=at;seen[at]=1;let loX=w,hiX=0,loY=h,hiY=0,touches=false;
  while(head<tail){const cell=queue[head++],xx=cell%w,yy=Math.floor(cell/w);loX=Math.min(loX,xx);hiX=Math.max(hiX,xx);loY=Math.min(loY,yy);hiY=Math.max(hiY,yy);if(xx===0||yy===0||xx===w-1||yy===h-1)touches=true;
   for(const next of [xx>0?cell-1:-1,xx<w-1?cell+1:-1,yy>0?cell-w:-1,yy<h-1?cell+w:-1])if(next>=0&&!dark[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}}
  const hw=hiX-loX+1,hh=hiY-loY+1,fill=tail/(hw*hh);if(!touches&&tail>=6&&tail<=1000&&hw>=3&&hh>=3&&hw/hh>=.65&&hw/hh<=1.55&&hw<=Math.min(w,h)*.55&&hh<=Math.min(w,h)*.55&&fill>=.38&&fill<=.91)holes.push({x:(loX+hiX)/2,y:(loY+hiY)/2,w:hw,h:hh,area:tail});
 }
 if(!holes.length)return unclear('no-local-pivot');
 const candidates:{axis:'horizontal'|'vertical';baseline:number;score:number;start:number;end:number;pivot:typeof holes[number]}[]=[];
 for(const axis of ['horizontal','vertical'] as const){const length=axis==='horizontal'?w:h,across=axis==='horizontal'?h:w,strip=Math.max(3,Math.floor(length*.18));
  for(let row=1;row<across-1;row++){let left=0,rightCount=0,start=-1,end=-1;
   for(let i=0;i<strip;i++){const a=axis==='horizontal'?row*w+i:i*w+row,b=axis==='horizontal'?row*w+length-1-i:(length-1-i)*w+row;if(dark[a]){left++;if(start<0)start=a;}if(dark[b]){rightCount++;if(end<0)end=b;}}
   if(left<Math.max(3,strip*.35)||rightCount<Math.max(3,strip*.35))continue;
   const pivots=holes.filter(hole=>Math.abs((axis==='horizontal'?hole.y:hole.x)-row)<=Math.max(hole.w,hole.h)*.55+2);
   if(pivots.length!==1)continue;const pivot=pivots[0],along=axis==='horizontal'?pivot.x:pivot.y;if(along<strip*.3||along>length-strip*.3)continue;
   candidates.push({axis,baseline:row,score:left+rightCount,start,end,pivot});
  }
 }
 if(!candidates.length)return unclear('terminal-rails-not-found');candidates.sort((a,b)=>b.score-a.score);const chosen=candidates[0];
 if(candidates.some(c=>c.axis!==chosen.axis&&c.score>=chosen.score*.9))return unclear('orientation-ambiguous');
 // Eight-neighbour dark connectivity passes around the hollow pivot, never through its white centre.
 const pivot=chosen.pivot,along=chosen.axis==='horizontal'?pivot.x:pivot.y,length=chosen.axis==='horizontal'?w:h,forward=along<length/2?1:-1,d=Math.max(pivot.w,pivot.h)+6,target=forward>0?chosen.end:chosen.start;
 const wantedX=pivot.x+(chosen.axis==='horizontal'?forward*(pivot.w/2+2):0),wantedY=pivot.y+(chosen.axis==='vertical'?forward*(pivot.h/2+2):0);let seed=-1,nearest=Infinity;
 for(let yy=Math.max(0,Math.floor(pivot.y-d));yy<=Math.min(h-1,Math.ceil(pivot.y+d));yy++)for(let xx=Math.max(0,Math.floor(pivot.x-d));xx<=Math.min(w-1,Math.ceil(pivot.x+d));xx++)if(dark[yy*w+xx]){const distance=Math.hypot(xx-wantedX,yy-wantedY);if(distance<nearest){nearest=distance;seed=yy*w+xx;}}
 if(seed<0)return unclear('pivot-ink-missing');const visited=new Uint8Array(w*h);let head=0,tail=1,clipped=false;queue[0]=seed;visited[seed]=1;
 while(head<tail){const cell=queue[head++];if(cell===target)return {contact:'touching',reason:'local-terminal-path'};const xx=cell%w,yy=Math.floor(cell/w);
  if(chosen.axis==='horizontal'&&(yy===0||yy===h-1)||chosen.axis==='vertical'&&(xx===0||xx===w-1))clipped=true;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=xx+dx,ny=yy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const position=chosen.axis==='horizontal'?nx:ny,cross=chosen.axis==='horizontal'?ny:nx;if((position-along)*forward<-d||Math.abs(cross-chosen.baseline)>d*4)continue;const next=ny*w+nx;if(dark[next]&&!visited[next]){visited[next]=1;queue[tail++]=next;}}
 }
 return clipped?unclear('contact-path-clipped'):{contact:'gap',reason:'local-terminal-gap'};
}

/** Browser-side contour proposals use pixels alone; no expected states or model answers enter this search. */
export function contactCandidates(raster:ContactRaster):ContactCandidate[]{
 if(!validContactRaster(raster))return [];const {width:w,height:h}=raster,binary=atob(raster.bits),dark=new Uint8Array(w*h),seen=new Uint8Array(w*h),queue=new Int32Array(w*h);for(let i=0;i<dark.length;i++)dark[i]=(binary.charCodeAt(i>>3)>>(i&7))&1;
 const holes:{x:number;y:number;d:number}[]=[];
 for(let at=0;at<dark.length;at++){if(dark[at]||seen[at])continue;let head=0,tail=1,loX=w,hiX=0,loY=h,hiY=0,border=false;queue[0]=at;seen[at]=1;
  while(head<tail){const cell=queue[head++],x=cell%w,y=Math.floor(cell/w);loX=Math.min(loX,x);hiX=Math.max(hiX,x);loY=Math.min(loY,y);hiY=Math.max(hiY,y);if(x===0||y===0||x===w-1||y===h-1)border=true;for(const next of [x>0?cell-1:-1,x<w-1?cell+1:-1,y>0?cell-w:-1,y<h-1?cell+w:-1])if(next>=0&&!seen[next]&&!dark[next]){seen[next]=1;queue[tail++]=next;}}
  const hw=hiX-loX+1,hh=hiY-loY+1,fill=tail/(hw*hh);if(!border&&tail>=6&&tail<=1000&&hw>=3&&hh>=3&&hw/hh>=.65&&hw/hh<=1.55&&fill>=.38&&fill<=.91)holes.push({x:(loX+hiX)/2,y:(loY+hiY)/2,d:Math.max(hw,hh)+6});
 }
 if(holes.length>500)return [];const found:ContactCandidate[]=[];
 for(const hole of holes){const directions:{dx:number;dy:number}[]=[];
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){let run=0;for(let step=Math.ceil(hole.d*.65);step<hole.d*4;step++){const x=Math.round(hole.x+dx*step),y=Math.round(hole.y+dy*step);let hit=false;for(let offset=-2;offset<=2;offset++){const xx=x+(dy?offset:0),yy=y+(dx?offset:0);if(xx>=0&&xx<w&&yy>=0&&yy<h&&dark[yy*w+xx])hit=true;}if(!hit)break;run++;}if(run>=hole.d*1.35)directions.push({dx,dy});}
  let best:ContactCandidate|undefined,contact:string|undefined,conflict=false;
  for(const direction of directions)for(const scale of [.8,1,1.35,1.7]){const d=hole.d*scale,horizontal=direction.dx!==0;const x=hole.x-d*(horizontal?(direction.dx<0?3:9):4),y=hole.y-d*(horizontal?4:direction.dy<0?3:9),width=d*(horizontal?12:8),height=d*(horizontal?8:12);if(x<0||y<0||x+width>w||y+height>h)continue;
   const region={x:x/w*1000,y:y/h*1000,width:width/w*1000,height:height/h*1000},evidence=inspectContact(raster,region);if(evidence.contact==='unclear')continue;if(contact&&contact!==evidence.contact)conflict=true;contact=evidence.contact;if(!best||width*height>best.region.width*w/1000*best.region.height*h/1000)best={pivot:{x:hole.x/w*1000,y:hole.y/h*1000},region};
  }
  if(best&&!conflict)found.push(best);if(found.length>=40)break;
 }
 return found;
}

export function validContactCandidates(value:unknown):value is ContactCandidate[]{
 if(!Array.isArray(value)||value.length>40)return false;return value.every(c=>c&&typeof c==='object'&&c.pivot&&c.region&&['x','y'].every(k=>typeof c.pivot[k]==='number'&&Number.isFinite(c.pivot[k])&&c.pivot[k]>=0&&c.pivot[k]<=1000)&&['x','y','width','height'].every(k=>typeof c.region[k]==='number'&&Number.isFinite(c.region[k])&&c.region[k]>=0&&c.region[k]<=1000)&&c.region.width>0&&c.region.height>0);
}

/** Two independent localisations must agree before applying a deterministic pixel verdict. */
export function corroborateContact(raster:ContactRaster|undefined,a:ContactRegion|undefined,b:ContactRegion|undefined,proposals?:ContactCandidate[]):ContactEvidence{
 if(!raster||!a||!b)return unclear('missing-independent-regions');
 if(proposals?.length){const closest=(region:ContactRegion)=>{const choices=proposals.map((candidate,index)=>{const x=candidate.pivot.x,y=candidate.pivot.y,dx=Math.max(region.x-x,0,x-region.x-region.width)*raster.width/1000,dy=Math.max(region.y-y,0,y-region.y-region.height)*raster.height/1000;return {index,distance:Math.hypot(dx,dy)};}).sort((x,y)=>x.distance-y.distance);const radius=Math.max(24,Math.min(100,Math.max(region.width*raster.width/1000,region.height*raster.height/1000)*.6));if(choices[0].distance>radius||choices[1]&&choices[1].distance-choices[0].distance<Math.max(12,radius*.15))return -1;return choices[0].index;};
  const first=closest(a),second=closest(b);if(first<0||first!==second)return unclear('independent-pivot-disagreement');const selected=proposals[first],x=Math.min(a.x,b.x,selected.region.x),y=Math.min(a.y,b.y,selected.region.y),region={x,y,width:Math.max(a.x+a.width,b.x+b.width,selected.region.x+selected.region.width)-x,height:Math.max(a.y+a.height,b.y+b.height,selected.region.y+selected.region.height)-y},evidence=inspectContact(raster,region);return {...evidence,pivotKey:`${selected.pivot.x.toFixed(1)},${selected.pivot.y.toFixed(1)}`};
 }
 // Localisation boxes are approximate; tolerate a quarter-box margin, never a different component location.
 const padded=(r:ContactRegion)=>({x:r.x-r.width*.25,y:r.y-r.height*.25,width:r.width*1.5,height:r.height*1.5}),aa=padded(a),bb=padded(b);
 const intersection=Math.max(0,Math.min(aa.x+aa.width,bb.x+bb.width)-Math.max(aa.x,bb.x))*Math.max(0,Math.min(aa.y+aa.height,bb.y+bb.height)-Math.max(aa.y,bb.y));
 if(intersection/Math.min(aa.width*aa.height,bb.width*bb.height)<.35)return unclear('region-disagreement');
 const one=inspectContact(raster,a),two=inspectContact(raster,b);if(one.contact!=='unclear'&&two.contact!=='unclear'&&one.contact!==two.contact)return unclear('pixel-disagreement');
 if(one.contact!=='unclear')return one;if(two.contact!=='unclear')return two;
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return inspectContact(raster,{x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y});
}
