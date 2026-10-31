"""Original textbook-style drawings with hand-authored ground truth, not LLM-generated labels."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
root=Path(__file__).resolve().parent.parent
out=root/'public/examples/vision-v4'; out.mkdir(parents=True,exist_ok=True)
fontpath='/System/Library/Fonts/Supplemental/Songti.ttc'
font=ImageFont.truetype(fontpath,28); titlefont=ImageFont.truetype(fontpath,34)
cases=[]
def document(edges):
 nodes=sorted({n for _,_,a,b,*_ in edges for n in (a,b)})
 return {'title':'人工标注电路','nodes':[{'id':n,'x':100+i%3*250,'y':100+i//3*100} for i,n in enumerate(nodes)],'components':[{'id':i,'name':i,'type':t,'a':a,'b':b,'value':v,'valueSource':'given' if v is not None else 'unknown','closed':c} for i,t,a,b,v,c in edges],'source':'image'}
def begin(title, h=1080):
 global im,d
 im=Image.new('RGB',(1350,h),'white');d=ImageDraw.Draw(im);d.text((65,35),title,font=titlefont,fill='black')
def line(points): d.line(points,fill='black',width=5,joint='curve')
def label(x,y,s): d.text((x,y),s,font=font,fill='black')
def dot(x,y):d.ellipse((x-7,y-7,x+7,y+7),fill='black')
def resistor(x,y,id,value=None,vertical=False,rheostat=False):
 if vertical:
  d.rectangle((x-23,y-70,x+23,y+70),fill='white',outline='black',width=5);label(x+38,y-25,id+(f' = {value} Ω' if value is not None else ''))
 else:
  d.rectangle((x-70,y-23,x+70,y+23),fill='white',outline='black',width=5);label(x-60,y-(120 if rheostat else 76),id+(f' = {value} Ω' if value is not None else ''))
 if rheostat:line([(x-45,y+65),(x+45,y-65)]);line([(x+22,y-55),(x+45,y-65),(x+42,y-42)])
def battery(y=700,value=None,x=320):
 d.rectangle((x-20,y-80,x+90,y+80),fill='white');line([(x-20,y),(x+10,y)]);line([(x+10,y-65),(x+10,y+65)]);line([(x+50,y-35),(x+50,y+35)]);line([(x+50,y),(x+90,y)]);label(x-45,y+85,'V1'+(f' = {value} V' if value is not None else ''))
def switch(x,y,id,closed=False,vertical=False):
 def p(a,b):return (x-b,y+a) if vertical else (x+a,y+b)
 d.rectangle((x-80,y-80,x+80,y+30) if not vertical else (x-35,y-80,x+85,y+80),fill='white')
 line([p(-80,0),p(-40,0)]);line([p(40,0),p(80,0)])
 line([p(-40,0),p(40,0) if closed else p(25,-45)])
 px,py=p(-40,0);d.ellipse((px-7,py-7,px+7,py+7),fill='white',outline='black',width=4)
 if closed:
  px,py=p(40,0);dot(px,py)
 label(x-25 if not vertical else x+48,y-110 if not vertical else y-20,id)
def save(name,edges,current=None,states=None):
 im.save(out/(name+'.png'),optimize=True)
 cases.append({'id':name,'file':'public/examples/vision-v4/'+name+'.png','source':'Original textbook-style fixture','expected':document(edges),'expectedCurrent':current,'states':states})
base=lambda s1,s2,u=None,r1=30,r2=None:[('V1','source','p','g',u,True),('R1','resistor','p','m',r1,True),('R2','resistor','m','n',r2,True),('S2','switch','m','n',None,s2),('S1','switch','g','n',None,s1)]
for name,s1,s2,u,r2,question in [
 ('question-initial-open',False,False,None,None,'R1 = 30 Ω。只闭合 S1 时电流为 0.3 A；再闭合 S2 后变为 0.5 A。'),
 ('main-closed-bypass-open',True,False,15,20,'断开 S1 后再观察；以上操作条件不改变图中原始画法。'),
 ('main-open-bypass-closed',False,True,15,20,'闭合 S1 后，观察电阻支路。'),
 ('both-closed',True,True,15,20,'断开 S2 后，再比较两次实验的电流。')]:
 begin('欧姆定律与开关实验');line([(150,700),(150,200),(1130,200),(1130,700),(150,700)]);line([(650,200),(650,460),(1130,460)])
 resistor(400,200,'R1',30 if u is not None else None);resistor(900,200,'R2',r2);dot(650,200);dot(1130,460);battery(value=u);switch(900,460,'S2',s2);switch(900,700,'S1',s1);label(65,910,question);label(65,970,'请根据原图建立实验电路，再逐步操作。')
 save(name,base(s1,s2,u,r2=r2),(0 if not s1 else u/(30+(0 if s2 else r2))) if u is not None else None)
for closed in [False,True]:
 begin('初中串联电路实验');line([(150,700),(150,200),(1100,200),(1100,700),(150,700)]);resistor(550,200,'R1',10);battery(value=6);switch(1100,450,'S1',closed,True);label(65,910,'闭合或断开开关后比较电流。请先按图示初始状态建模。')
 save('vertical-'+('closed' if closed else 'open'),[('V1','source','p','g',6,True),('R1','resistor','p','a',10,True),('S1','switch','a','g',None,closed)],.6 if closed else 0)
begin('并联支路与总开关');line([(150,700),(150,200),(1130,200),(1130,700),(150,700)]);line([(150,460),(1130,460)]);resistor(650,200,'R1',6);resistor(650,460,'R2',3);battery(value=9);switch(1000,460,'S2',False);switch(900,700,'S1',True);dot(150,460);dot(1130,460);label(65,910,'再闭合 S2，观察干路电流如何改变。')
save('parallel-branch-control',[('V1','source','p','g',9,True),('R1','resistor','p','n',6,True),('R2','resistor','p','m',3,True),('S2','switch','m','n',None,False),('S1','switch','g','n',None,True)],1.5)
begin('电流表与电压表');line([(150,720),(150,200),(1130,200),(1130,720),(150,720)]);resistor(620,200,'R1',4);resistor(1130,430,'R2',8,True);battery(720,12);switch(900,720,'S1',False)
d.ellipse((335,165,405,235),fill='white',outline='black',width=5);label(359,177,'A');label(340,110,'A1');line([(980,200),(980,620),(1130,620)]);d.ellipse((945,395,1015,465),fill='white',outline='black',width=5);label(966,407,'V');label(900,340,'VM1');dot(980,200);dot(1130,620);label(65,925,'闭合 S1 后，读取电流表与电压表。')
save('ammeter-voltmeter',[('V1','source','p','g',12,True),('A1','ammeter','p','a',None,True),('R1','resistor','a','b',4,True),('R2','resistor','b','n',8,True),('VM1','voltmeter','b','n',None,True),('S1','switch','g','n',None,False)],0)
begin('高中桥式电阻网络');line([(150,780),(150,200),(1100,200),(1100,780),(150,780)]);line([(150,500),(1100,500)]);line([(650,200),(650,500)]);battery(780,10);resistor(400,200,'R1',10);resistor(900,200,'R2',10);resistor(400,500,'R3',10);resistor(900,500,'R4',10);resistor(650,350,'R5',10,True);dot(650,200);dot(650,500);dot(150,500);dot(1100,500)
save('wheatstone-bridge',[('V1','source','p','g',10,True),('R1','resistor','p','a',10,True),('R2','resistor','a','g',10,True),('R3','resistor','p','b',10,True),('R4','resistor','b','g',10,True),('R5','resistor','a','b',10,True)],1)
begin('滑动变阻器实验');line([(150,700),(150,200),(1130,200),(1130,700),(150,700)]);resistor(420,200,'R1',4);resistor(900,200,'RP1',8,rheostat=True);battery(value=12);switch(900,700,'S1',True)
save('rheostat-closed',[('V1','source','p','g',12,True),('R1','resistor','p','a',4,True),('RP1','rheostat','a','b',8,True),('S1','switch','b','g',None,True)],1)
begin('初中灯泡与开关');line([(150,700),(150,200),(1130,200),(1130,700),(150,700)]);d.ellipse((565,145,675,255),fill='white',outline='black',width=5);line([(580,160),(660,240)]);line([(580,240),(660,160)]);label(600,90,'L1');battery(value=3);switch(900,700,'S1',False);label(65,910,'闭合开关后观察灯泡。')
save('lamp-open',[('V1','source','p','g',3,True),('L1','lamp','p','a',None,True),('S1','switch','a','g',None,False)])
begin('交叉导线：无实心点不连接',1150);line([(150,700),(150,200),(1000,200),(1000,700),(150,700)]);resistor(450,200,'R1',4);resistor(700,700,'R2',8);battery(700,12,x=220);line([(150,450),(985,450)]);line([(1015,450),(1160,450),(1160,860),(500,860),(500,700)]);d.arc((985,435,1015,465),180,360,fill='black',width=5);resistor(500,450,'R3',6);dot(150,450);dot(500,700);label(65,1000,'跨越处没有连接点，不能把不同节点短接。')
save('crossing-no-junction',[('V1','source','p','g',12,True),('R1','resistor','p','a',4,True),('R2','resistor','a','g',8,True),('R3','resistor','p','g',6,True)],3)
(out/'manifest.json').write_text(json.dumps({'cases':cases},ensure_ascii=False,indent=2))
print('Created',len(cases),'original circuit diagrams and hand-annotated expected graphs.')
