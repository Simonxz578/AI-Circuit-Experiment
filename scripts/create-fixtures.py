"""Original circuit diagrams, drawn for this project; no third-party imagery."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'public'/'examples'
root.mkdir(parents=True,exist_ok=True)
fontpath='/System/Library/Fonts/Supplemental/Arial.ttf'
font=ImageFont.truetype(fontpath,32); small=ImageFont.truetype(fontpath,26); title=ImageFont.truetype(fontpath,38)
def fixture(kind):
 im=Image.new('RGB',(1400,850),'white');d=ImageDraw.Draw(im)
 def line(points):d.line(points,fill='#171b21',width=5)
 def dot(x,y):d.ellipse((x-7,y-7,x+7,y+7),fill='#171b21')
 def resistor(x,y,label,vertical=False):
  if vertical:
   d.rectangle((x-20,y-70,x+20,y+70),fill='white',outline='#171b21',width=5);d.text((x+40,y-22),label,fill='black',font=font)
  else:
   d.rectangle((x-70,y-20,x+70,y+20),fill='white',outline='#171b21',width=5);d.text((x-75,y-72),label,fill='black',font=font)
 def source(value):
  line([(160,180),(160,660)]);d.ellipse((105,365,215,475),fill='white',outline='black',width=5);d.text((148,375),'+',fill='black',font=font);d.text((150,433),'-',fill='black',font=font);d.text((30,490),f'V1 = {value} V',font=small,fill='black')
 d.text((70,40),{'series':'Series circuit','parallel':'Parallel circuit','mixed':'An unfamiliar mixed circuit'}[kind],font=title,fill='black')
 source(10 if kind=='series' else 12)
 line([(160,180),(1200,180),(1200,660),(160,660)])
 if kind=='series':resistor(640,180,'R1 = 4 ohm');resistor(1200,420,'R2 = 6 ohm',True)
 elif kind=='parallel':
  line([(700,180),(700,660)]);resistor(700,420,'R1 = 6 ohm',True);resistor(1200,420,'R2 = 3 ohm',True);dot(700,180);dot(700,660)
 else:
  resistor(430,180,'R1 = 2 ohm');line([(800,180),(800,660)]);resistor(800,420,'R2 = 6 ohm',True);resistor(1200,420,'R3 = 3 ohm',True);dot(800,180);dot(800,660)
 d.text((70,760),'Find the source current. Ideal wires and DC source.',font=small,fill='black')
 # Extend canvas for readable rightmost labels instead of clipping them.
 wide=Image.new('RGB',(1550,850),'white');wide.paste(im,(0,0))
 # Labels at right must fit inside the original image; move them left of the branch.
 if kind=='series':
  dd=ImageDraw.Draw(wide);dd.rectangle((1230,380,1550,470),fill='white');dd.text((970,395),'R2 = 6 ohm',font=font,fill='black')
 elif kind=='parallel':
  dd=ImageDraw.Draw(wide);dd.rectangle((1230,380,1550,470),fill='white');dd.text((1230,395),'R2 = 3 ohm',font=font,fill='black')
 else:
  dd=ImageDraw.Draw(wide);dd.rectangle((1230,380,1550,470),fill='white');dd.text((1230,395),'R3 = 3 ohm',font=font,fill='black')
 wide.save(root/f'{kind}.png',optimize=True)
for kind in ['series','parallel','mixed']:fixture(kind)
print('Created 3 original PNG circuit fixtures.')
