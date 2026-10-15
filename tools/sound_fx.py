"""One-time production of sound, score, and live particle systems."""
import subprocess,json,os,shutil
os.makedirs('assets/audio',exist_ok=True);os.makedirs('assets/fx',exist_ok=True)
def run(tool,c,op,*args):subprocess.run([tool,'--config',c,op,*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def config(name,extra):
 p='assets/source/'+name+'.config.json';json.dump(dict(sample_rate=22050,channels='mono',max_duration_ms=3000,seed=72,actions='assets/source/'+name+'.ops.json',preview='assets/source/'+name+'.png',wav='assets/audio/'+name+'.wav',**extra),open(p,'w'));return p
for name,sample,freq,dur in [('drill','engine_diesel_idle',97,1000),('thrust','whoosh_air',64,850),('ore-pickup','mech_clip_load',740,400),('material-chime','zap_electric',554,1100),('gas-explosion','cannon_body_heavy',55,1600),('lava-sizzle','fire_crackle',190,850),('impact','impact_metal_hollow',100,650),('fabricate','mech_ratchet',440,650),('launch','boom_sub_rumble',55,2400),('death','debris_rubble',70,1600),('alarm-fuel',None,440,700),('alarm-core',None,220,600)]:
 c=config(name,{})
 tool='sfx-sample' if sample else 'sfx-synth';run(tool,c,'init')
 if sample:run(tool,c,'add-sample','--name',sample,'--t',0,'--gain',-11,'--trim',f'0,{dur}','--fade-out',80)
 run(tool,c,'add-voice','--name','tone','--wave','sine' if name not in ['drill','thrust'] else 'triangle','--freq',freq,'--dur',dur,'--gain',-21 if sample else -18)
 run(tool,c,'set-envelope','--voice','tone','--env','gate' if name in ['drill','thrust'] else 'pluck')
 if name in ['ore-pickup','material-chime','fabricate']:
  for i,m in enumerate([1.25,1.5,2]):run(tool,c,'add-voice','--name','bell'+str(i),'--wave','sine','--freq',freq*m,'--start',90+i*90,'--dur',300,'--gain',-25)
 run(tool,c,'render')
c=config('music',{})
v=json.load(open(c));v['max_duration_ms']=32000;v['mid']='assets/audio/music.mid';json.dump(v,open(c,'w'))
run('music',c,'init');run('music',c,'set-tempo','--bpm',72)
for track,inst,gain in [('drone','synth_pad',-17),('bass','sine',-17),('bells','electric_piano',-12),('pulse','drum_kick',-16)]:
 run('music',c,'define-track','--name',track,'--instrument',inst);run('music',c,'set-track-fx','--track',track,'--gain',gain,'--reverb',0.32)
for b,root in enumerate([38,34,41,36]):
 t=b*8
 for n in [root,root+7,root+12]:run('music',c,'add-note','--track','drone','--pitch',n,'--t',t,'--dur',7.8,'--velocity',65)
 for i in range(4):run('music',c,'add-note','--track','bass','--pitch',root-12,'--t',t+i*2,'--dur',1.3,'--velocity',65)
 for i,n in enumerate([root+24,root+31,root+26,root+19]):run('music',c,'add-note','--track','bells','--pitch',n,'--t',t+i*1.75+0.5,'--dur',1.4,'--velocity',50)
 for i in range(4):run('music',c,'add-note','--track','pulse','--pitch',36,'--t',t+i*2,'--dur',0.3,'--velocity',45)
run('music',c,'render')
for name,col,speed,count,life,size in [('gas-seep','#9ec6aa',14,5,1400,0.9),('drill-debris','#b5a389',85,18,500,0.45),('jetpack-exhaust','#7ae4ff',100,22,500,0.7),('ore-sparkle','#ffe8ab',60,22,700,0.45),('material-shimmer','#83ffe1',70,45,1200,0.65),('gas-explosion','#ffbd79',210,100,1100,1.7),('lava-embers','#ff985e',75,20,850,0.6),('impact-dust','#aa9983',85,35,850,1.1),('core-extract','#ff9e7a',90,65,1500,1.1),('core-detonation','#ffc7a0',340,200,2000,2.3),('launch-exhaust','#bceeff',150,80,1300,1.8),('death-burst','#96c7d0',120,65,1000,0.7)]:
 c='assets/source/'+name+'.config.json'
 json.dump(dict(width=480,height=480,duration_ms=2200,fps=24,seed=72,actions='assets/source/'+name+'.ops.json',preview='assets/source/'+name+'.gif'),open(c,'w'))
 run('particle-2d',c,'init');run('particle-2d',c,'add-emitter','--name','body','--shape','disc','--radius',12,'--x',0,'--y',0,'--burst',count,'--lifetime',life,'--lifetime-spread',life//3,'--speed',speed,'--speed-spread',speed/2,'--dir-y',-1 if name in ['jetpack-exhaust','launch-exhaust'] else 1,'--cone-angle',20 if name in ['jetpack-exhaust','launch-exhaust','gas-seep'] else 180)
 run('particle-2d',c,'set-particle','--emitter','body','--size-from',size,'--size-to',size*0.2,'--opacity-from',0.18 if name=='gas-seep' else 0.85,'--opacity-to',0,'--color-gradient',col+'@0,'+('#ef6048' if 'explosion' in name or 'detonation' in name else col)+'@1')
 run('particle-2d',c,'set-forces','--gravity',-35 if name!='gas-seep' else 5,'--drag',0.8,'--turbulence','8,0.05')
 if 'explosion' in name or 'detonation' in name:
  run('particle-2d',c,'add-emitter','--name','shock','--shape','disc','--radius',2,'--x',0,'--y',0,'--burst',80,'--lifetime',350,'--speed',350,'--cone-angle',180)
  run('particle-2d',c,'set-particle','--emitter','shock','--size-from',0.45,'--size-to',0.05,'--opacity-from',1,'--opacity-to',0,'--color-gradient','#fff4cd@0,#ffbd79@1')
 run('particle-2d',c,'render');shutil.move('system.json','assets/fx/'+name+'.json')
print('Audio and effects rendered')
