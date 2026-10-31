import {findDiagramRegion,contactDetailRegion} from './circuit/vision';
import {contactRaster,contactCandidates,type ContactRaster,type ContactCandidate} from './circuit/contactVision';

/** The original stays visible; only a temporary detail image is sent for independent visual checking. */
async function computeVisionInput(image:string):Promise<{imageDetail?:string;diagramImage?:string;diagramRegion?:{x:number;y:number;width:number;height:number};contactRaster?:ContactRaster;contactCandidates?:ContactCandidate[]}>{
 try{
  const img=new Image();img.src=image;await img.decode();const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return {};
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,raster=contactRaster(pixels,canvas.width,canvas.height),candidates=contactCandidates(raster),result={contactRaster:raster,contactCandidates:candidates},region=findDiagramRegion(pixels,canvas.width,canvas.height);if(!region)return result;
  const encode=(r:typeof region)=>{const crop=document.createElement('canvas');crop.width=Math.min(1800,Math.round(r.width/scale));crop.height=Math.round(crop.width*r.height/r.width);const target=crop.getContext('2d');if(!target)return;target.fillStyle='white';target.fillRect(0,0,crop.width,crop.height);target.drawImage(img,r.x/scale,r.y/scale,r.width/scale,r.height/scale,0,0,crop.width,crop.height);return crop.toDataURL('image/jpeg',.9);};
  const diagramImage=encode(region),detail=encode(contactDetailRegion(region)),diagramRegion={x:region.x/canvas.width*1000,y:region.y/canvas.height*1000,width:region.width/canvas.width*1000,height:region.height/canvas.height*1000};
  return {...result,diagramImage,diagramRegion,imageDetail:image.length+(detail?.length??0)+(diagramImage?.length??0)+raster.bits.length<3_900_000?detail:undefined};
 }catch{return {};}
}

// Only the last image is kept in page memory. Pixels and verification output are unchanged.
let preparedImage:string|undefined,prepared:ReturnType<typeof computeVisionInput>|undefined;
export function prepareVisionInput(image:string){if(image!==preparedImage||!prepared){preparedImage=image;prepared=computeVisionInput(image);}return prepared;}
