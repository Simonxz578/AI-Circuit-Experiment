"""Original two-switch bypass diagram, matching the topology in the bug report."""
from pathlib import Path
import sys
from PIL import Image,ImageDraw,ImageFont
unknown='--unknown' in sys.argv
out=Path(__file__).resolve().parent.parent/('public/examples/switch-unknown.png' if unknown else 'public/examples/switch-bypass.png')
im=Image.new('RGB',(1300,800),'white'); d=ImageDraw.Draw(im)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',32)
def line(points):d.line(points,fill='black',width=5)
def text(x,y,s):d.text((x,y),s,font=font,fill='black')
line([(150,620),(150,180),(1100,180),(1100,620),(150,620)])
for x,label in [(400,'R1' if unknown else 'R1 = 10 ohm'),(900,'R2' if unknown else 'R2 = 20 ohm')]:
 d.rectangle((x-65,160,x+65,200),fill='white',outline='black',width=5);text(x-90,105,label)
line([(650,180),(650,400),(1100,400)])
for x,y,label in [(850,400,'S2'),(850,620,'S1')]:
 d.rectangle((x-45,y-38,x+45,y+8),fill='white');line([(x-45,y),(x+30,y-35)])
 for cx in [x-45,x+45]:d.ellipse((cx-5,y-5,cx+5,y+5),fill='white',outline='black',width=3)
 text(x-16,y-85,label)
d.rectangle((250,570,390,670),fill='white');line([(150,620),(295,620)]);line([(345,620),(805,620)]);line([(295,580),(295,660)]);line([(345,595),(345,645)])
text(245,535,'+');text(347,548,'-');text(240,690,'V1 (DC)' if unknown else 'V1 = 12 V DC')
for x,y in [(650,180),(1100,400)]:d.ellipse((x-7,y-7,x+7,y+7),fill='black')
text(70,35,'R1 + R2 = 30 ohm; individual values unknown.' if unknown else 'Two switches: S1 main switch; S2 bypasses R2. Both initially OPEN.')
im.save(out,optimize=True);print('Created switch-bypass.png (original regression fixture).')
