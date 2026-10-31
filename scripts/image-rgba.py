"""Decode test inputs or encode a crop; no model labels are used in image preprocessing."""
import sys, struct
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGBA')
if len(sys.argv)==2:
 im.thumbnail((1200,1200)); sys.stdout.buffer.write(struct.pack('<II',*im.size)+im.tobytes())
else:
 import io
 import json
 region=json.loads(sys.argv[2]); original=im.size; small=im.copy();small.thumbnail((1200,1200));scale=small.width/original[0]
 x,y,w,h=(region[k]/scale for k in ('x','y','width','height'))
 cropped=im.crop((int(x),int(y),int(x+w),int(y+h))).convert('RGB');cropped.thumbnail((1800,1800));out=io.BytesIO();cropped.save(out,format='JPEG',quality=90);sys.stdout.buffer.write(out.getvalue())
