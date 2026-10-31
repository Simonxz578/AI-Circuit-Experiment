/** Detect the long dark strokes of a schematic, independently of OCR or model answers. */
export type DiagramRegion={x:number;y:number;width:number;height:number};
export function findDiagramRegion(rgba:Uint8ClampedArray|Uint8Array,width:number,height:number):DiagramRegion|null{
 if(width<180||height<180||rgba.length<width*height*4)return null;
 const dark=(x:number,y:number)=>{const i=(y*width+x)*4;return rgba[i+3]>180&&rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114<100;};
 const minimum=Math.max(45,Math.round(Math.min(width,height)*.065));let left=width,right=0,top=height,bottom=0,hitsH=0,hitsV=0;
 for(let y=0;y<height;y+=2){let start=-1;for(let x=0;x<=width;x++){if(x<width&&dark(x,y)){if(start<0)start=x;}else if(start>=0){if(x-start>=minimum){left=Math.min(left,start);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);hitsH++;}start=-1;}}}
 for(let x=0;x<width;x+=2){let start=-1;for(let y=0;y<=height;y++){if(y<height&&dark(x,y)){if(start<0)start=y;}else if(start>=0){if(y-start>=minimum){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,start);bottom=Math.max(bottom,y);hitsV++;}start=-1;}}}
 const w=right-left,h=bottom-top;if(hitsH<3||hitsV<3||w<width*.25||h<height*.18)return null;
 // Labels commonly sit above the top rail. The lower margin stays narrow to exclude later operating conditions.
 const x=Math.max(0,Math.floor(left-w*.1)),y=Math.max(0,Math.floor(top-h*.26)),r=Math.min(width,Math.ceil(right+w*.1)),b=Math.min(height,Math.ceil(bottom+Math.max(48,h*.05)));
 if((r-x)*(b-y)>width*height*.93)return null;return {x,y,width:r-x,height:b-y};
}

/** Enlarge the central/lower contact area while keeping switch labels and the full original available. */
export function contactDetailRegion(region:DiagramRegion):DiagramRegion{
 const inset=Math.floor(region.height*.30);return {...region,y:region.y+inset,height:region.height-inset};
}

