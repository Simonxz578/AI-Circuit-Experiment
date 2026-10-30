import type {CircuitDocument,Component} from './schema';

export type Point={x:number;y:number};
export type Placement={id:string;x:number;y:number;vertical:boolean;reversed:boolean;terminalA:Point;terminalB:Point;escapeA:Point;escapeB:Point};
export type WireRoute={net:string;points:Point[];owner?:string};
export type CircuitLayout={width:number;height:number;placements:Record<string,Placement>;wires:WireRoute[];junctions:(Point&{net:string})[];mode:'series-parallel'|'general';routingMs:number};
type Tree={kind:'edge';a:string;b:string;component:Component}|{kind:'series'|'parallel';a:string;b:string;children:Tree[]};
type Size={w:number;h:number;baseline:number};
const snap=(n:number)=>Math.round(n/10)*10;
const sortId=(a:string,b:string)=>a.localeCompare(b,'en',{numeric:true});

function reverse(tree:Tree):Tree{
 if(tree.kind==='edge')return {...tree,a:tree.b,b:tree.a};
 return {...tree,a:tree.b,b:tree.a,children:(tree.kind==='series'?[...tree.children].reverse():tree.children).map(reverse)};
}
const orient=(tree:Tree,a:string)=>tree.a===a?tree:reverse(tree);
function combine(kind:'series'|'parallel',a:string,b:string,children:Tree[]):Tree{
 return {kind,a,b,children:children.flatMap(c=>c.kind===kind?c.children:[c])};
}
function decompose(edges:Tree[],start:string,end:string):Tree|null{
 let work=[...edges];
 for(let round=0;round<160;round++){
  if(work.length===1)return work[0].a!==work[0].b&&[work[0].a,work[0].b].includes(start)&&[work[0].a,work[0].b].includes(end)?orient(work[0],start):null;
  const groups=new Map<string,Tree[]>();
  for(const e of work){const key=[e.a,e.b].sort(sortId).join('|');groups.set(key,[...(groups.get(key)??[]),e]);}
  const parallel=[...groups.values()].find(group=>group.length>1&&group[0].a!==group[0].b);
  if(parallel){const a=parallel[0].a,b=parallel[0].b;work=work.filter(e=>!parallel.includes(e));work.push(combine('parallel',a,b,parallel.map(e=>orient(e,a))));continue;}
  const nodes=[...new Set(work.flatMap(e=>[e.a,e.b]))].sort(sortId);let reduced=false;
  for(const node of nodes){
   if(node===start||node===end)continue;const adjacent=work.filter(e=>e.a===node||e.b===node);
   if(adjacent.length!==2||adjacent.some(e=>e.a===e.b))continue;
   const [one,two]=adjacent,a=one.a===node?one.b:one.a,b=two.a===node?two.b:two.a;
   if(a===b)continue;
   work=work.filter(e=>e!==one&&e!==two);work.push(combine('series',a,b,[orient(one,a),orient(two,node)]));reduced=true;break;
  }
  if(!reduced)return null;
 }
 return null;
}
function measure(tree:Tree):Size{
 if(tree.kind==='edge')return {w:230,h:180,baseline:90};
 const sizes=tree.children.map(measure);
 if(tree.kind==='parallel')return {w:Math.max(...sizes.map(s=>s.w))+120,h:sizes.reduce((sum,s)=>sum+s.h,0)+40*(sizes.length-1),baseline:sizes[0].baseline};
 const baseline=Math.max(...sizes.map(s=>s.baseline));return {w:sizes.reduce((sum,s)=>sum+s.w,0),h:baseline+Math.max(...sizes.map(s=>s.h-s.baseline)),baseline};
}

/** Only a wire collapses a visual net. Switch state and parameter changes never move the diagram. */
function electricalNets(doc:CircuitDocument){
 const parents=new Map(doc.nodes.map(n=>[n.id,n.id]));
 const root=(id:string):string=>{const p=parents.get(id)!;if(id===p)return id;const r=root(p);parents.set(id,r);return r;};
 for(const c of doc.components)if(c.type==='wire'){const a=root(c.a),b=root(c.b);if(a!==b){const [first,last]=[a,b].sort(sortId);parents.set(last,first);}}
 return root;
}
function placement(c:Component,x:number,y:number,leftNet:string,root:(id:string)=>string):Placement{
 x=snap(x);y=snap(y);const reversed=root(c.a)!==leftNet;
 const left={x:x-65,y},right={x:x+65,y},escapeLeft={x:x-110,y},escapeRight={x:x+110,y};
 return {id:c.id,x,y,vertical:false,reversed,terminalA:reversed?right:left,terminalB:reversed?left:right,escapeA:reversed?escapeRight:escapeLeft,escapeB:reversed?escapeLeft:escapeRight};
}
const collides=(a:Point,b:Point)=>Math.abs(a.x-b.x)<230&&Math.abs(a.y-b.y)<180;

class Heap{
 private values:{id:number;score:number}[]=[];
 get length(){return this.values.length;}
 push(id:number,score:number){const a=this.values;a.push({id,score});let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].score<=score)break;[a[p],a[i]]=[a[i],a[p]];i=p;}}
 pop(){const a=this.values,first=a[0],last=a.pop()!;if(a.length){a[0]=last;let i=0;while(true){let j=i*2+1;if(j>=a.length)break;if(j+1<a.length&&a[j+1].score<a[j].score)j++;if(a[i].score<=a[j].score)break;[a[i],a[j]]=[a[j],a[i]];i=j;}}return first;}
}
function simplify(points:Point[]):Point[]{
 const out:Point[]=[];
 for(const p of points){if(out.length&&out.at(-1)!.x===p.x&&out.at(-1)!.y===p.y)continue;while(out.length>1){const a=out[out.length-2],b=out[out.length-1];if((a.x===b.x&&b.x===p.x)||(a.y===b.y&&b.y===p.y))out.pop();else break;}out.push(p);}
 return out;
}

function routeNets(doc:CircuitDocument,positions:Record<string,Placement>,root:(id:string)=>string,width:number,height:number){
 const step=10,nx=Math.ceil(width/step)+1,ny=Math.ceil(height/step)+1,count=nx*ny;
 const blocked=new Uint8Array(count),occupied=new Int16Array(count),directions=new Uint8Array(count);
 const all=Object.values(positions),index=(p:Point)=>Math.round(p.y/step)*nx+Math.round(p.x/step),point=(id:number):Point=>({x:(id%nx)*step,y:Math.floor(id/nx)*step});
 for(const p of all){for(let y=Math.max(1,Math.ceil((p.y-78)/step));y<=Math.min(ny-2,Math.floor((p.y+78)/step));y++)for(let x=Math.max(1,Math.ceil((p.x-90)/step));x<=Math.min(nx-2,Math.floor((p.x+90)/step));x++)blocked[y*nx+x]=1;}
 const nets=new Map<string,{terminal:Point;escape:Point;owner:string}[]>();
 for(const c of doc.components){const p=positions[c.id];if(!p)continue;for(const [net,terminal,escape] of [[root(c.a),p.terminalA,p.escapeA],[root(c.b),p.terminalB,p.escapeB]] as const)nets.set(net,[...(nets.get(net)??[]),{terminal,escape,owner:c.id}]);}
 const wires:WireRoute[]=[],segmentsByNet=new Map<string,Set<string>>();let netNumber=0;
 const segmentKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
 const reserve=(cells:number[],net:string,number:number)=>{
  const segments=segmentsByNet.get(net)??new Set<string>();
  for(let i=1;i<cells.length;i++){const a=cells[i-1],b=cells[i],direction=Math.abs(a-b)===1?1:2;occupied[a]||=number;occupied[b]||=number;directions[a]|=direction;directions[b]|=direction;segments.add(segmentKey(a,b));}
  segmentsByNet.set(net,segments);
 };
 const search=(start:number,goal:number,number:number):number[]=>{
  if(start===goal)return [start];
  const size=count*3,g=new Float64Array(size);g.fill(Infinity);const previous=new Int32Array(size);previous.fill(-1);const heap=new Heap();const initial=start*3;g[initial]=0;heap.push(initial,0);
  const end=point(goal),visited=new Uint8Array(size);let final=-1;
  while(heap.length){const item=heap.pop(),state=item.id;if(visited[state])continue;visited[state]=1;const cell=Math.floor(state/3),oldDirection=state%3;if(cell===goal){final=state;break;}const x=cell%nx,y=Math.floor(cell/nx);
   for(const [dx,dy,direction] of [[1,0,1],[-1,0,1],[0,1,2],[0,-1,2]] as const){const xx=x+dx,yy=y+dy;if(xx<1||yy<1||xx>=nx-1||yy>=ny-1)continue;const next=yy*nx+xx;if(blocked[next]&&next!==goal&&next!==start)continue;
    const other=occupied[next]&&occupied[next]!==number;
    // Different nets may cross at right angles, but must never share a line or turn at a crossing.
    if(other&&(directions[next]&direction))continue;
    if(occupied[cell]&&occupied[cell]!==number&&oldDirection&&oldDirection!==direction)continue;
    const penalty=other?12:occupied[next]===number?.2:1;
    const cost=g[state]+penalty+(oldDirection&&oldDirection!==direction?3.2:0),nextState=next*3+direction;
    if(cost>=g[nextState])continue;g[nextState]=cost;previous[nextState]=state;heap.push(nextState,cost+(Math.abs(xx*step-end.x)+Math.abs(yy*step-end.y))/step*.2);
   }
  }
  if(final<0)throw new Error('没有足够的导线通道，请重新布局。');
  const cells:number[]=[];for(let at=final;at!==-1;at=previous[at])cells.push(Math.floor(at/3));return cells.reverse();
 };
 const ordered=[...nets.entries()].sort((a,b)=>b[1].length-a[1].length||sortId(a[0],b[0]));
 for(const [net,ports] of ordered){
  netNumber++;const number=netNumber,tree=new Set<number>();
  const orderedPorts=[...ports].sort((a,b)=>a.escape.y-b.escape.y||a.escape.x-b.escape.x||sortId(a.owner,b.owner));
  // Include the terminal stubs when finding junctions; a branch meeting a stub is an electrical T too.
  for(const port of orderedPorts){const first=index(port.terminal),last=index(port.escape),delta=first<last?1:-1,cells:number[]=[];for(let cell=first;;cell+=delta){cells.push(cell);if(cell===last)break;}reserve(cells,net,number);}
  for(const port of orderedPorts){
   wires.push({net,points:[port.terminal,port.escape],owner:port.owner});const start=index(port.escape);
   if(!tree.size){tree.add(start);continue;}
   let goal=start,best=Infinity;const s=point(start);
   for(const cell of tree){const p=point(cell),distance=Math.abs(p.x-s.x)+Math.abs(p.y-s.y);if(distance<best){best=distance;goal=cell;}}
   const cells=search(start,goal,number);reserve(cells,net,number);for(const cell of cells)tree.add(cell);wires.push({net,points:simplify(cells.map(point))});
  }
 }
 const junctions:(Point&{net:string})[]=[];
 for(const [net,segments] of segmentsByNet){const adjacent=new Map<number,Set<number>>();for(const segment of segments){const [a,b]=segment.split(':').map(Number);if(!adjacent.has(a))adjacent.set(a,new Set());if(!adjacent.has(b))adjacent.set(b,new Set());adjacent.get(a)!.add(b);adjacent.get(b)!.add(a);}for(const [id,neighbors] of adjacent)if(neighbors.size>=3)junctions.push({...point(id),net});}
 return {wires,junctions};
}

export function layoutCircuit(doc:CircuitDocument):CircuitLayout{
 const started=performance.now(),root=electricalNets(doc),components=doc.components.filter(c=>c.type!=='wire').sort((a,b)=>sortId(a.id,b.id));
 const source=components.find(c=>c.type==='source'),others=components.filter(c=>c!==source);
 const tree=source?decompose(others.map(component=>({kind:'edge',a:root(component.a),b:root(component.b),component})),root(source.a),root(source.b)):null;
 let load=tree,tail:Extract<Tree,{kind:'edge'}>|undefined;
 if(load?.kind==='series'){const last=load.children.at(-1)!;if(last.kind==='edge'&&['switch','fuse'].includes(last.component.type)&&load.children.length>1){tail=last;const children=load.children.slice(0,-1);load=children.length===1?children[0]:combine('series',load.a,last.a,children);}}
 let width=1000,height=650;const positions:Record<string,Placement>={};
 const draw=(t:Tree,x:number,y:number,w:number)=>{
  const size=measure(t);
  if(t.kind==='edge'){positions[t.component.id]=placement(t.component,x+w/2,y+size.baseline,t.a,root);return;}
  if(t.kind==='series'){const sizes=t.children.map(measure),extra=(w-size.w)/t.children.length;let xx=x;t.children.forEach((child,i)=>{const cw=sizes[i].w+extra;draw(child,xx,y+size.baseline-sizes[i].baseline,cw);xx+=cw;});}
  else {let yy=y;for(const child of t.children){draw(child,x+60,yy,w-120);yy+=measure(child).h+40;}}
 };
 if(load&&source){const size=measure(load),networkWidth=Math.max(760,size.w);width=networkWidth+240;const sourceY=100+size.h+130;height=sourceY+120;draw(load,120,100,networkWidth);
  if(tail){positions[source.id]=placement(source,width*.3,sourceY,root(source.a),root);positions[tail.component.id]=placement(tail.component,width*.72,sourceY,root(source.b),root);}
  else positions[source.id]=placement(source,width/2,sourceY,root(source.a),root);
 }else{
  const columns=Math.max(2,Math.min(6,Math.ceil(Math.sqrt(Math.max(1,others.length)*1.6)))),rows=Math.ceil(others.length/columns);width=Math.max(1000,columns*260+160);height=Math.max(650,rows*220+320);
  others.forEach((c,i)=>positions[c.id]=placement(c,180+i%columns*260,160+Math.floor(i/columns)*220,root(c.a),root));if(source)positions[source.id]=placement(source,width/2,height-130,root(source.a),root);
 }
 // Only explicit user positions can override layout; model coordinates never place symbols.
 const placed:Placement[]=[];
 for(const c of components){let p=positions[c.id];if(!p)continue;
  if(c.positionSource==='manual'&&c.position){let target={x:snap(Math.max(130,Math.min(width-130,c.position.x))),y:snap(Math.max(110,Math.min(height-110,c.position.y)))};
   if(placed.some(other=>collides(target,other))){let best=Infinity;for(let y=110;y<height-100;y+=20)for(let x=130;x<width-120;x+=20){const candidate={x,y};if(placed.some(other=>collides(candidate,other)))continue;const score=Math.abs(x-target.x)+Math.abs(y-target.y);if(score<best){best=score;target=candidate;}}}
   p=placement(c,target.x,target.y,p.reversed?root(c.b):root(c.a),root);positions[c.id]=p;
  }
  if(placed.some(other=>collides(p,other))){let target:Point|undefined;for(let y=110;y<height-100&&!target;y+=190)for(let x=140;x<width-120;x+=230){if(!placed.some(other=>collides({x,y},other))){target={x,y};break;}}if(target){p=placement(c,target.x,target.y,p.reversed?root(c.b):root(c.a),root);positions[c.id]=p;}}
  placed.push(p);
 }
 const routes=routeNets(doc,positions,root,width,height);
 return {width,height,placements:positions,...routes,mode:load?'series-parallel':'general',routingMs:performance.now()-started};
}

export function topologyKey(doc:CircuitDocument){return JSON.stringify(doc.components.map(c=>[c.id,c.type,c.a,c.b,c.positionSource==='manual'?c.position:null]).sort((a,b)=>sortId(String(a[0]),String(b[0]))));}
export function pathData(points:Point[]){return points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');}
export function wireEntersOtherSymbol(route:WireRoute,placements:Record<string,Placement>){
 return Object.values(placements).some(p=>p.id!==route.owner&&route.points.some((a,i)=>{if(!i)return false;const b=route.points[i-1];if(a.x===b.x)return Math.abs(a.x-p.x)<90&&Math.max(a.y,b.y)>p.y-78&&Math.min(a.y,b.y)<p.y+78;if(a.y===b.y)return Math.abs(a.y-p.y)<78&&Math.max(a.x,b.x)>p.x-90&&Math.min(a.x,b.x)<p.x+90;return true;}));
}
