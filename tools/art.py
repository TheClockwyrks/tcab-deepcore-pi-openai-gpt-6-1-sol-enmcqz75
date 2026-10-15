"""One-time art authoring. Emits draw/draw-sheet operation logs and renders PNGs.
Not part of the build. All coordinates are authored pixel art, never runtime art.
"""
import json,random,subprocess,os,math
random.seed(46)
ROOT='assets'
def rect(a,x,y,w,h,c): a.append(dict(op='fill_rect',x=int(x),y=int(y),width=max(1,int(w)),height=max(1,int(h)),color=c))
def line(a,x,y,x2,y2,c): a.append(dict(op='line',x0=int(x),y0=int(y),x1=int(x2),y1=int(y2),color=c))
def circle(a,x,y,r,c): a.append(dict(op='fill_circle',cx=int(x),cy=int(y),r=int(r),color=c))
def save(path,a,w=80,h=80,sheet=False):
 os.makedirs(os.path.dirname(ROOT+'/'+path),exist_ok=True)
 log=ROOT+'/source/'+path.replace('/','_')+'.json';json.dump(a,open(log,'w'))
 subprocess.run(['draw-sheet' if sheet else 'draw','render','--actions',log,'--out',ROOT+'/'+path,'--width',str(w),'--height',str(h),'--no-layers'],check=True,stdout=subprocess.DEVNULL)
def rock(base,pal):
 a=[];rect(a,0,0,80,80,base)
 for i in range(950):
  x=random.randrange(80);y=random.randrange(80);rect(a,x,y,random.choice([1,2,3,4]),random.choice([1,1,2]),random.choice(pal))
 for i in range(5):
  x=random.randrange(80);y=random.randrange(80);line(a,x,y,min(79,x+random.randrange(5,18)),min(79,y+random.randrange(-3,4)),pal[0])
 return a
palettes=[('#59463e',['#635047','#6a5549','#4e3c36','#70594b','#514139']),('#41474d',['#4a5056','#383d44','#55585c','#454b51','#343b43']),('#292f3b',['#32394a','#242a35','#3b4052','#303444','#222733']),('#3d2831',['#492b33','#532e35','#32232e','#44232c','#5c343a'])]
for b,(base,pal) in zip(['topsoil','rockbed','deepstone','coreshell'],palettes):
 for n in range(3):save(f'tiles/{b}-{n}.png',rock(base,pal))
save('tiles/tunnel.png',rock('#101b24',['#111e29','#13212c','#0e1922']))
a=rock('#252d37',['#343d48','#202832','#3d4651']);
for y in range(0,80,20):
 line(a,0,y,79,y,'#101b24');line(a,(y*3)%70,y,(y*3)%70,y+20,'#101b24')
save('tiles/bedrock.png',a)
for n in range(2):
 a=[]
 # Cold, rounded ferrous monolith, with bevels, striations and a hard rim.
 for y in range(5,77):
  normalized=(y-40)/36;inset=int(5+22*(abs(normalized)**3))+n*2
  rect(a,inset,y,80-inset*2,1,'#172734')
  rect(a,inset+2,y,76-inset*2,1,'#73848e' if y<17 else '#425867' if y<53 else '#293c4c')
  if y>10 and y<68:rect(a,inset+4,y,4,1,'#91a2a7' if y<39 else '#4e6571')
 for x in [26,43,57]:
  line(a,x,19,x-7,58,'#70838d');line(a,x+2,22,x-5,58,'#263c4d')
 line(a,23,65,57,65,'#4e6574');line(a,25,69,54,69,'#172c3d')
 for i in range(20):
  x=random.randrange(16,65);y=random.randrange(18,63);rect(a,x,y,2,1,'#526b79')
 save(f'tiles/stone-{n}.png',a)
colors=['#c0b7a7','#a0b67a','#e79a63','#e2e9ef','#7ca9dc','#d8db70','#83d5cb','#e38c72','#d6636a','#b8a0df','#7ceda4','#f184be','#f6d17c']
minerals=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite']
for idx,(name,c) in enumerate(zip(minerals,colors)):
 a=[]
 if idx<10:
  for i in range(220):
   x=random.randrange(80); y=int(40+12*math.sin(x/17)+random.gauss(0,8));rect(a,x,y,random.randrange(1,6),random.randrange(1,4),c+random.choice(['66','99','bb','dd','ff']))
  for x in range(0,80,6):line(a,x,40+int(12*math.sin(x/17)),min(79,x+6),40+int(12*math.sin((x+6)/17)),c)
 else:
  for y in range(14,65):
   half=int(25*(1-abs(y-36)/30));rect(a,40-half,y,half*2,1,c if y<37 else '#516571')
  rect(a,30,23,21,14,c);line(a,15,34,40,62,'#e5fff1');line(a,40,62,32,36,c);line(a,51,25,63,35,'#ffffff');line(a,57,19,57,31,'#ffffff');line(a,51,25,63,25,'#ffffff')
 save(f'ore/{name}.png',a)
for name,c in [('resonite','#68e9c3'),('cryenite','#94c9ff'),('core','#ff926a'),('core-sample','#ffcc94')]:
 a=[]
 for x,y,height in [(17,41,22),(30,27,38),(44,17,49),(57,36,28)]:
  for yy in range(y,y+height):
   inset=max(0,7-(yy-y));rect(a,x+inset,yy,16-inset,1,c+'55');rect(a,x+inset+2,yy,6,1,c)
  line(a,x+8,y+2,x+8,y+height-3,'#e9ffff')
 if name=='core':
  a=[]
  for radius,color in [(36,'#81364a44'),(32,'#aa4b4f77'),(28,'#a83e46'),(25,'#e46b4f'),(21,'#ffb76c'),(14,'#ffe6a5'),(8,'#ffffd4')]:circle(a,40,40,radius,color)
  for x0,y0,x1,y1 in [(7,28,28,35),(15,60,30,48),(44,12,39,29),(68,55,53,46),(61,17,49,32)]:
   line(a,x0,y0,x1,y1,'#542e43');line(a,x0+1,y0+1,x1+1,y1+1,'#ffd78a')
  for x,y in [(11,12),(63,8),(9,67),(67,68)]:rect(a,x,y,3,3,'#fac185')
 if name=='core-sample':
  a=[];circle(a,40,41,22,'#ffb97633');rect(a,27,16,27,47,'#142e3c');rect(a,30,17,21,44,'#e9bd84');rect(a,33,22,15,32,'#794a43');rect(a,36,25,9,26,'#fba96d');rect(a,38,27,5,22,'#fff0ac');rect(a,25,17,31,8,'#7b969d');rect(a,25,56,31,8,'#7b969d');rect(a,29,18,21,3,'#ccdad2');rect(a,29,58,21,3,'#ccdad2');rect(a,27,36,6,8,'#284556');rect(a,49,36,6,8,'#284556');rect(a,48,18,4,3,'#e9b375')
 save(f'materials/{name}.png',a)
for frame in range(4):
 a=[]
 for j in range(frame+1):
  x=40;y=38
  for k in range(5):
   nx=x+random.randrange(-15,16);ny=y+random.randrange(-15,16);line(a,x,y,nx,ny,'#10131ddd');x=nx;y=ny
 save(f'tiles/crack/frame{frame:02}.png',a,sheet=True)
for frame in range(4):
 a=rock('#a33e36',['#ae4534','#c35237','#8d3434'])
 for y in range(0,80,9):
  for x in range(80):
   yy=y+int(3*math.sin((x+frame*9)/12));rect(a,x,yy,2,2,'#ffc57b');rect(a,x,yy+2,2,2,'#ef8550')
 save(f'hazards/lava/frame{frame:02}.png',a,sheet=True)
# Prospector: charcoal outlines, ivory helmet, orange pressure suit, cyan glass.
for state,frames in [('idle',4),('walk',6),('drill-down',4),('drill-side',4),('jetpack',4),('fall',4),('hurt',3),('fuel-out',3)]:
 for f in range(frames):
  a=[];bob=(f%2) if state=='idle' else (f%3-1);sx=([-7,-4,-1][f] if state=='hurt' else 0);sy=bob+(5 if state=='fuel-out' else -3 if state=='jetpack' else 0)
  def R(x,y,w,h,c):rect(a,x+sx,y+sy,w,h,c)
  # pack silhouette and cylinders
  R(12,29,17,29,'#091521');R(14,31,11,25,'#6d8390');R(15,33,4,19,'#a3bac0');R(16,54,8,8,'#182c39');R(12,35,4,14,'#e3a15a')
  # boots, strides
  stride=round(math.sin(f/frames*math.tau)*7) if state=='walk' else (4 if state=='fall' else 0)
  R(28-stride,53,12,19,'#102431');R(42+stride,53,11,18,'#102431');R(28-stride,55,10,10,'#bc7546');R(42+stride,55,9,10,'#e29c53');R(26-stride,68,17,6,'#8babb4');R(42+stride,67,16,6,'#8babb4')
  # torso, belt and fittings
  R(25,29,31,28,'#102431');R(28,31,25,22,'#ffe1b5' if state=='hurt' and f==0 else '#db8d42');R(29,31,6,20,'#f9bd6a');R(28,52,27,6,'#334c5a');R(38,51,8,5,'#b6d0d0');R(37,34,12,10,'#243f50');R(40,36,6,3,'#76e2e0')
  # helmet sealed rim and visor
  R(25,6,29,25,'#102431');R(21,12,37,14,'#102431');R(25,8,27,20,'#c4c9b8');R(23,13,33,11,'#ece1bc');R(34,14,23,12,'#173d51');R(36,15,17,7,'#58abb6');R(36,15,14,2,'#a5e7e1');R(48,16,5,3,'#dcffff');R(22,15,5,7,'#708e93');R(38,5,13,6,'#485f67');R(41,5,7,5,'#fff0ba' if f%2 else '#ffffff')
  # arm and handheld drill
  if state=='drill-down':
   R(49,37,10,17,'#f5ad5e');R(46,49,13,8,'#bbc7c2');R(42,55,18,12,'#6f8590');R(47,64,9,9,'#cfdae0');R(49,71,5,7,'#eef8ec');R(45+f%2,59,13,3,'#263d4e')
  else:
   ay=34 if state=='drill-side' else 40 if state!='fall' else 27
   R(49,ay,13,10,'#efaa5c');R(57,ay+3,9,8,'#d0d6c8');R(60,ay+4,14,13,'#263e50');R(61,ay+4,11,7,'#8ca4ab');R(69,ay+7,8,6,'#c3d5d5');R(75,ay+8,5,3,'#edf4e5')
  if state=='jetpack':
   for i in range(14+(f%3)*2):rect(a,16+int(i/5),61+i,8-int(i/3),1,'#70ecf2' if i<7 else '#dff9ef')
  # Pressure-seal seams, gauntlet buckles, shoulder patch and boot tread.
  R(28,45,6,2,'#9d6039');R(47,31,5,3,'#f5d8a1');R(30,61,7,2,'#775b45');R(43,61,7,2,'#775b45');R(29,71,10,2,'#354c59');R(45,70,10,2,'#354c59');R(16,38,7,2,'#c4cebd');R(20,33,3,6,'#324c59')
  if state=='hurt':R(20,21,9,4,'#fff3dc')
  save(f'miner/{state}/frame{f:02}.png',a,sheet=True)
# Surface architecture: six distinct silhouettes, lit terminals, riveted plating.
for idx,id in enumerate(['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']):
 a=[];w=240;h=200
 if id=='launch-pad':
  rect(a,10,170,220,25,'#344d5a');rect(a,18,167,204,5,'#8da4aa');rect(a,27,30,12,140,'#4d6470')
  for y in range(38,168,20):line(a,28,y,82,y+18,'#78919b')
 elif id=='save-pad':
  rect(a,33,173,174,20,'#304a59');rect(a,75,99,88,76,'#19303e');rect(a,80,100,78,55,'#6e9b9c');rect(a,87,107,64,38,'#163e4b');rect(a,98,118,42,7,'#7be9d1');rect(a,111,108,15,27,'#7be9d1');rect(a,89,158,9,7,'#f4c179')
 else:
  rect(a,14,78,211,112,'#112432');rect(a,19,83,201,100,'#536770');rect(a,22,87,195,48,'#354d5b');rect(a,12,72,216,12,'#9da9a5');rect(a,18,182,207,11,'#263d49')
  for x in range(28,220,32):rect(a,x,92,2,79,'#657d83');rect(a,x,91,3,3,'#b3bfad')
  rect(a,81,129,51,54,'#152c3b');rect(a,86,135,41,48,'#274753');rect(a,89,139,31,16,'#67bdbb');rect(a,119,162,4,8,'#edc681')
  rect(a,32,96,137,25,'#142c38')
  for x in range(40,159,8):rect(a,x,102,4,11,'#d8c19a' if idx%2 else '#7fd1cd')
  if id=='fuel-depot':
   rect(a,161,31,43,140,'#213a48');rect(a,166,34,33,130,'#b2784b');rect(a,167,40,8,111,'#e5b56b');rect(a,162,62,40,5,'#617883');rect(a,162,144,40,5,'#617883');rect(a,147,151,17,7,'#8ca3a5')
  if id=='ore-market':
   rect(a,166,135,42,38,'#1d3948');rect(a,170,139,34,27,'#99baa9');line(a,174,155,184,145,'#213d4a');line(a,184,145,197,158,'#213d4a')
  if id=='upgrade-shop':
   rect(a,171,35,14,41,'#63818d');circle(a,178,31,18,'#9db9ba');circle(a,178,31,10,'#193848');rect(a,169,13,18,12,'#091c29')
  if id=='supply-depot':
   for x in [147,181]:rect(a,x,145,28,33,'#b68e5e');line(a,x,145,x+27,177,'#3c5257');line(a,x,177,x+27,145,'#3c5257')
 save('surface/'+id+'.png',a,w,h)
for stage in range(6):
 a=[];rect(a,8,205,144,18,'#526d79');rect(a,12,203,136,4,'#bac4b3')
 if stage:
  rect(a,58,43,43,158,'#253f50');rect(a,62,47,35,151,'#a2b1ab');rect(a,64,49,8,144,'#e9dfb7');rect(a,90,49,6,144,'#647e87')
  for y in range(58,187,21):rect(a,62,y,34,3,'#577682')
 if stage>=2:
  for x in [37,102]:rect(a,x,100,20,98,'#c59862');rect(a,x+3,102,5,89,'#e9c281')
 if stage>=3:circle(a,80,81,11,'#254b60');circle(a,80,81,7,'#80d0ce')
 if stage>=4:
  for y in range(150,201):rect(a,45-(y-150)//4,y,15,1,'#cd804a');rect(a,101,y,15+(y-150)//4,1,'#cd804a')
 if stage>=5:
  for y in range(8,44):
   half=max(1,(y-8)//2);rect(a,80-half,y,half*2,1,'#d4c3a1');rect(a,80-half,y,4,1,'#f0e1b7')
  rect(a,64,120,32,13,'#e29b57')
 save(f'rocket/stage{stage}.png',a,160,240)
a=[]
for y in range(480):
 t=y/480;rect(a,0,y,1280,1,'#%02x%02x%02x'%(int(10+15*t),int(23+15*t),int(35+13*t)))
for i in range(150):
 x=random.randrange(1280);y=random.randrange(350);rect(a,x,y,1 if i%3 else 2,1,'#8da7ae' if i%4 else '#d1ceab')
circle(a,1004,112,47,'#7f8d89');circle(a,991,101,43,'#aab0a0');circle(a,973,93,10,'#8e9d96');circle(a,1008,123,13,'#8e9d96')
for x in range(1280):
 y=370+int(20*math.sin(x/61)+15*math.sin(x/33));rect(a,x,y,1,480-y,'#263d49')
save('surface/sky.png',a,1280,480)
a=rock('#394b4c',['#455853','#59665b','#2b4145']);rect(a,0,0,80,5,'#a39774');rect(a,0,5,80,6,'#687568');save('surface/ground.png',a)
a=[]
for y in range(80):rect(a,4,y,72,1,'#0d1b26');
for x in range(0,80,10):rect(a,x,0,5,8,'#d2ae67')
save('surface/cave-mouth.png',a)
for i,name in enumerate(['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']):
 a=[];c=['#eac47c','#8de0d1','#b3c4cb','#eac47c','#8db5ce','#68e9c3','#94c9ff','#ffad82'][i]
 if i==0:rect(a,5,5,12,17,c);rect(a,8,2,7,4,c);rect(a,8,9,6,7,'#233c49');line(a,18,8,21,12,c);line(a,21,12,21,20,c)
 elif i==1:
  for y in range(3,21):rect(a,4+(y//9),y,16-2*(y//9),1,c)
  rect(a,11,6,3,10,'#26454e')
 elif i==2:rect(a,3,6,18,16,c);rect(a,5,8,14,12,'#26454e');rect(a,10,8,3,12,c)
 elif i==3:circle(a,12,12,10,c);circle(a,12,12,7,'#26454e');rect(a,10,6,4,12,c)
 elif i==4:line(a,12,2,12,21,c);line(a,5,14,12,21,c);line(a,12,21,19,14,c)
 else:
  for y in range(2,22):
   half=max(1,int(8*(1-abs(y-12)/12)));rect(a,12-half,y,half*2,1,c)
  line(a,12,4,12,20,'#dffff0')
 save(f'icons/{name}.png',a,24,24)
print('Art rendered')
