import { KITCHEN_LEVEL, KITCHEN_LEVEL_DEFINITION as LEVEL } from '../dist/sim/level.js'
import { interpolateSnapshots } from '../dist/render/interpolate.js'
import { KitchenScene } from '../dist/render/kitchen-scene.js'
import { Juice, TraumaShake } from '../dist/render/juice.js'
import { ParticlePool, FloatingLabels, canvasPixelRatio } from '../dist/render/arcade-effects.js'
import { sprite } from './egg-art.js'
import { createKitchenMaterials, createTilePattern } from './kitchen-art.js'

const TAU = Math.PI * 2
const INK = '#36574c'
const FACE_DEFINITIONS = [
  { indices: [2,3,7,6], sign: -1, material: 'top' },
  { indices: [6,7,5,4], sign: -1, material: 'front' },
  { indices: [3,7,5,1], sign: 1, material: 'side' },
  { indices: [2,3,1,0], sign: 1, material: 'side' },
  { indices: [6,2,0,4], sign: 1, material: 'side' },
  { indices: [0,1,5,4], sign: 1, material: 'side' },
]
const depth = (x,y,z) => x * 0.24 + y * 0.22 + z

function sparkle(ctx,x,y,r,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-r)
  ctx.quadraticCurveTo(x+r*.2,y-r*.2,x+r,y);ctx.quadraticCurveTo(x+r*.2,y+r*.2,x,y+r)
  ctx.quadraticCurveTo(x-r*.2,y+r*.2,x-r,y);ctx.quadraticCurveTo(x-r*.2,y-r*.2,x,y-r);ctx.fill()
}

/**
 * Asset-free oblique Canvas projection of canonical 3D geometry. Solid surfaces
 * use the exact level corners; only background decor and cues are non-colliding.
 * No WebGL requirement and no secondary physics / animation clock for platforms.
 */
export class KitchenView {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false})
    if(!this.ctx)throw new Error('Canvas 2D is unavailable')
    this.scene=new KitchenScene();this.materials=createKitchenMaterials()
    this.floor=createTilePattern(this.ctx);this.wall=createTilePattern(this.ctx,true)
    this.juice=new Juice();this.failShake=new TraumaShake()
    this.particles=new ParticlePool(160);this.labels=new FloatingLabels();this.pendingEvents=[]
    this.width=1;this.height=1;this.dpr=1;this.quality='high';this.reducedMotion=false
    this.disposed=false;this.overview=true;this.time=0;this.steamDebt=0;this.launchFlash=0;this.lastLaunchTick=-1;this.ended=false
    this.camera={x:18,y:4,z:-4,scale:1};this.lastVisible={x:10,y:2.6,z:-4}
    this.preview={tick:0,position:{x:LEVEL.spawn[0],y:LEVEL.spawn[1],z:LEVEL.spawn[2]},rotation:{x:0,y:0,z:0,w:1},linearVelocity:{x:0,y:0,z:0},
      identity:{levelId:KITCHEN_LEVEL.id,levelVersion:KITCHEN_LEVEL.version,levelFormatVersion:KITCHEN_LEVEL.formatVersion,levelHash:KITCHEN_LEVEL.hash},physics:{grounded:false},
      gameplay:{completionTick:null,activeContinuousForceZoneIds:[],activatedLaunchZoneIds:[],launchZoneInside:[false]}}
    this.faces=this.scene.boxes.flatMap(box=>FACE_DEFINITIONS.map(face=>({box,...face,kind:'face',points:new Float64Array(8),visible:false,depth:0})))
    this.eggItem={kind:'egg',depth:0,visible:true}
    this.queue=[...this.faces,this.eggItem]
    this.scene.update(this.preview,this.preview,1)
  }
  resize(width,height){
    if(this.disposed)return
    this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height))
    this.dpr=canvasPixelRatio(window.devicePixelRatio||1,this.quality)
    this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr)
    this.camera.scale=this.overview?this.overviewScale():this.followScale()
    const c=this.ctx
    this.sky=c.createLinearGradient(0,0,this.width*.5,this.height)
    this.sky.addColorStop(0,'#e8eddf');this.sky.addColorStop(.55,'#f1ead8');this.sky.addColorStop(1,'#e8dbbc')
  }
  overviewScale(){return Math.min(this.width/25,this.height/14)}
  followScale(){return Math.min(this.width/9.8,this.height/7.7)}
  readyY(scale){return LEVEL.spawn[1]+(Math.min(this.height*.46,this.height-230)-this.height*.55)/Math.max(1,scale)}
  setQuality(value){if(!['high','medium','low'].includes(value)||value===this.quality)return;this.quality=value;this.resize(this.width,this.height)}
  setReducedMotion(value){this.reducedMotion=value;this.juice.reset();this.failShake.reset();this.particles.reset();this.labels.reset();this.pendingEvents.length=0;this.launchFlash=0}
  setOverview(value){this.overview=Boolean(value)}
  onPhase(phase){if(phase==='playing')this.overview=false}
  reset(snapshot){
    this.overview=this.width>=620;this.ended=false;this.time=0;this.steamDebt=0;this.launchFlash=0;this.lastLaunchTick=-1
    const scale=this.overview?this.overviewScale():this.followScale()
    this.camera={x:this.overview?18:LEVEL.spawn[0]+1.7,y:this.readyY(scale),z:-4,scale}
    this.juice.reset(snapshot?.position.y??2.6);this.failShake.reset();this.particles.reset();this.labels.reset();this.pendingEvents.length=0
    const initial=snapshot??this.preview;this.lastVisible={...initial.position};this.scene.update(initial,initial,1)
  }
  accept(frame,score,previousScore){
    for(const event of frame.events)if(this.pendingEvents.length<64)this.pendingEvents.push(event)
    if(this.reducedMotion)return
    const {x,y,z}=frame.current.position
    const band=Math.floor(score.heightMm/500),previousBand=Math.floor(previousScore.heightMm/500)
    if(band>previousBand)this.labels.spawn(x,y+1,`+${(band-previousBand)*50}`,false,z)
    if(score.bonus>previousScore.bonus){this.labels.spawn(x,y+1.2,score.combo>1?'GREAT!':'NICE HOP',true,z);this.particles.spawn(x,y,'spark',this.quality==='low'?6:14,z)}
  }
  record(){if(!this.reducedMotion)this.particles.spawn(this.lastVisible.x,this.lastVisible.y,'spark',this.quality==='low'?12:32,this.lastVisible.z)}
  end(reason){
    this.ended=true
    if(this.reducedMotion)return
    if(reason==='fall'){this.failShake.add(.8);this.particles.spawn(this.lastVisible.x,this.lastVisible.y,'shell',32,this.lastVisible.z)}
    else this.record()
  }
  get telemetry(){return {cabinetY:this.scene.cabinetY,steamActive:this.scene.steamActive,lastLaunchTick:this.lastLaunchTick,completionTick:this.scene.completionTick,overview:this.overview}}
  px(x,z){return this.width*.45+((x-this.camera.x)-(z-this.camera.z)*.24)*this.camera.scale}
  py(y,z){return this.height*.55+(-(y-this.camera.y)+(z-this.camera.z)*.22)*this.camera.scale}

  prepareFaces(pose){
    const scale=this.camera.scale
    for(const face of this.faces){
      const v=face.box.corners,[a,b,,d]=face.indices
      const ax=v[b*3]-v[a*3],ay=v[b*3+1]-v[a*3+1],az=v[b*3+2]-v[a*3+2]
      const bx=v[d*3]-v[a*3],by=v[d*3+1]-v[a*3+1],bz=v[d*3+2]-v[a*3+2]
      const facing=((ay*bz-az*by)*.24+(az*bx-ax*bz)*.22+(ax*by-ay*bx))*face.sign
      face.visible=facing>0.00001;face.depth=0
      if(!face.visible)continue
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
      for(let i=0;i<4;i++){
        const index=face.indices[i]*3,x=this.px(v[index],v[index+2]),y=this.py(v[index+1],v[index+2])
        face.points[i*2]=x;face.points[i*2+1]=y
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)
        face.depth+=depth(v[index],v[index+1],v[index+2])*.25
      }
      face.visible=maxX>-scale&&minX<this.width+scale&&maxY>-scale&&minY<this.height+scale
    }
    this.eggItem.depth=depth(pose.position.x,pose.position.y,pose.position.z)
    this.queue.sort((a,b)=>a.depth-b.depth)
  }
  drawFace(face){
    const c=this.ctx,p=face.points,texture=this.materials.get(`${face.box.definition.id}:${face.material}`)
    c.save();c.beginPath();c.moveTo(p[0],p[1]);for(let i=1;i<4;i++)c.lineTo(p[i*2],p[i*2+1]);c.closePath()
    c.fillStyle='#c6cdb9';c.fill();c.clip()
    c.transform((p[2]-p[0])/texture.width,(p[3]-p[1])/texture.width,(p[6]-p[0])/texture.height,(p[7]-p[1])/texture.height,p[0],p[1])
    c.drawImage(texture,0,0);c.restore()
    c.strokeStyle=face.material==='top'?'#637e6055':'#4b65594a';c.lineWidth=.8
    c.beginPath();c.moveTo(p[0],p[1]);for(let i=1;i<4;i++)c.lineTo(p[i*2],p[i*2+1]);c.closePath();c.stroke()
  }
  worldLine(ax,ay,az,bx,by,bz,color,width=1){
    const c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(this.px(ax,az),this.py(ay,az));c.lineTo(this.px(bx,bz),this.py(by,bz));c.stroke()
  }
  wallRect(x,y,w,h,z,color){
    const c=this.ctx,s=this.camera.scale;c.fillStyle=color;c.fillRect(this.px(x,z),this.py(y+h,z),w*s,h*s)
  }
  drawRoom(){
    const c=this.ctx,s=this.camera.scale
    c.fillStyle=this.sky;c.fillRect(0,0,this.width,this.height)
    // Decorative wall/floor are separate background planes, never new colliders.
    c.save();c.transform(s/64,0,-.24*s/64,.22*s/64,this.px(0,0),this.py(-1.5,0))
    c.fillStyle=this.floor.pattern;c.fillRect(4*64,-12*64,28*64,17*64);c.restore()
    c.save();c.transform(s/64,0,0,-s/64,this.px(0,-10),this.py(0,-10))
    c.fillStyle=this.wall.pattern;c.fillRect(4*64,-1.5*64,28*64,13.5*64);c.restore()
    this.wallRect(4,1.2,28,.12,-9.98,'#afbeaa')
    // The window, crockery and cupboard fronts are painted on the back wall.
    this.wallRect(23,7.1,6.2,3.9,-9.95,'#9eb6aa')
    this.wallRect(23.18,7.3,5.84,3.52,-9.94,'#c9dfcf')
    this.wallRect(23.25,7.4,5.7,1.1,-9.93,'#b6cba8')
    this.wallRect(25.98,7.25,.15,3.6,-9.9,'#fff4d4');this.wallRect(23.1,9.02,6,.14,-9.9,'#fff4d4')
    this.wallRect(22.85,7.02,6.5,.18,-9.85,'#f2e5c5')
    const sunX=this.px(27.35,-9.9),sunY=this.py(10,-9.9)
    c.fillStyle='#fff0bb';c.beginPath();c.arc(sunX,sunY,s*.4,0,TAU);c.fill()
    for(const x of [7.5,11,14.5,18]){
      this.wallRect(x,7.5,2.9,2.2,-9.94,'#bccfbc');this.wallRect(x+.12,7.62,2.66,1.96,-9.92,'#d6e0c9')
      this.wallRect(x+2.48,8.12,.07,.55,-9.9,'#738e78')
    }
    // Hanging utensils and a soft tea-towel illustration, outside the playable depth.
    this.worldLine(8,6.55,-9.9,16.5,6.55,-9.9,'#8c9777',2)
    for(let i=0;i<5;i++){
      const x=9+i*1.2;this.worldLine(x,6.55,-9.88,x,5.7,-9.88,'#71856a',1.3)
      c.strokeStyle='#7c8e73';c.lineWidth=1.5;c.beginPath();c.ellipse(this.px(x,-9.88),this.py(5.45,-9.88),s*.14,s*.27,0,0,TAU);c.stroke()
    }
    this.wallRect(16.4,4.8,1.15,1.65,-9.87,'#e6c6a1')
    this.wallRect(16.62,4.8,.11,1.65,-9.85,'#bf8f76');this.wallRect(17.02,4.8,.11,1.65,-9.85,'#bf8f76')
    // Cabinet travel rails show the exact authored one-way range.
    const lift=LEVEL.kinematicBoxes[0]
    for(const x of [lift.center[0]-lift.halfExtents[0]+.12,lift.center[0]+lift.halfExtents[0]-.12]){
      this.worldLine(x,lift.center[1]-.65,-8.8,x,lift.center[1]+lift.motion.distance+.65,-8.8,'#64816c88',2)
    }
  }

  drawZone(zone,color,alpha){
    const c=this.ctx,[x,y,z]=zone.center,[hx,hy,hz]=zone.halfExtents
    // Both depth edges are shown: this is an authored 3D volume, not a 2D trigger.
    c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=1;c.setLineDash([4,5])
    for(const zz of [z-hz,z+hz]){
      const xx=this.px(x-hx,zz),yy=this.py(y+hy,zz)
      c.strokeRect(xx,yy,hx*2*this.camera.scale,hy*2*this.camera.scale)
    }
    c.setLineDash([]);c.restore()
  }
  drawSteam(){
    const c=this.ctx,zone=LEVEL.continuousForceZones[0],[x,y,z]=zone.center,s=this.camera.scale
    this.drawZone(zone,'#a4af88',this.scene.steamActive ? .6 : .2)
    c.save();c.lineCap='round';c.strokeStyle=this.scene.steamActive?'#fff9e0c9':'#fffbed88';c.lineWidth=this.overview?1.5:2
    for(let strand=0;strand<5;strand++){
      const xx=x-1+strand*.47,phase=this.reducedMotion?0:Math.sin(this.time*1.8+strand)*.12
      c.beginPath();c.moveTo(this.px(xx,z),this.py(y-1.25,z))
      c.bezierCurveTo(this.px(xx+.3+phase,z),this.py(y-.65,z),this.px(xx-.32+phase,z),this.py(y+.3,z),this.px(xx+.08,z),this.py(y+1.4,z));c.stroke()
    }
    c.restore()
    if(this.scene.steamActive){c.fillStyle='#f9e7ae2b';c.fillRect(this.px(x-1.5,z),this.py(y+2.5,z),3*s,5*s)}
  }
  tag(label,x,y,z,active=false){
    const c=this.ctx,px=this.px(x,z),py=this.py(y,z)
    if(px<-90||px>this.width+90||py<50||py>this.height-25)return
    c.font=`600 ${this.overview?8:9}px 'Trebuchet MS',sans-serif`
    const width=c.measureText(label).width+18
    if(px-width/2<12||px+width/2>this.width-12)return
    c.fillStyle=active?'#f5d696':'#f9f4e4e6';c.strokeStyle=active?'#b88751':'#bdc8b3';c.lineWidth=.8
    c.beginPath();c.roundRect(px-width/2,py-9,width,19,6);c.fill();c.stroke()
    c.fillStyle=INK;c.textAlign='center';c.textBaseline='middle';c.fillText(label,px,py+.5);c.textBaseline='alphabetic'
  }
  drawGoal(){
    const goal=LEVEL.finishVolumes[0],[x,y,z]=goal.center,c=this.ctx,s=this.camera.scale
    this.drawZone(goal,'#8aa271',this.scene.completionTick!==null ? .8 : .3)
    const pulse=this.reducedMotion?1:1+Math.sin(this.time*2)*.06
    c.save();c.globalAlpha=this.scene.completionTick!==null ? .65 : .32
    c.strokeStyle='#d1aa5b';c.lineWidth=2;c.beginPath();c.ellipse(this.px(x,z),this.py(y,z),s*.66*pulse,s*.95*pulse,0,0,TAU);c.stroke();c.restore()
    sparkle(c,this.px(x,z),this.py(y+1.7,z),this.overview?5:8,'#d9ac58')
    this.tag('THE WAY OUT',x,y+2.3,z,this.scene.completionTick!==null)
  }
  drawEgg(pose,effect,snapshot,phase){
    if(this.ended&&phase==='over')return
    const c=this.ctx,s=this.camera.scale,{x,y,z}=pose.position,px=this.px(x,z),py=this.py(y,z)
    if(px>0&&px<this.width&&py>0&&py<this.height-20)this.lastVisible={x,y,z}
    if(snapshot.physics.grounded){c.fillStyle='#405f4521';c.beginPath();c.ellipse(px,py+s*.53,s*.38,s*.065,0,0,TAU);c.fill()}
    const q=pose.rotation,upX=2*(q.x*q.y-q.w*q.z),upY=1-2*(q.x*q.x+q.z*q.z),upZ=2*(q.y*q.z+q.w*q.x)
    const angle=Math.atan2(upX-.24*upZ,upY-.22*upZ)
    c.save();c.translate(px,py);c.rotate(angle)
    if(!this.reducedMotion)c.scale(effect.squash.x,effect.squash.y)
    c.drawImage(sprite,-s*.64,-s*.96,s*1.28,s*1.6)
    c.fillStyle=INK;c.strokeStyle=INK;c.lineWidth=Math.max(.75,s*.017);c.lineCap='round'
    const blink=!this.reducedMotion&&this.time%4.7>4.55
    for(const xx of [-.135,.135]){c.beginPath();if(blink){c.moveTo((xx-.025)*s,.03*s);c.lineTo((xx+.025)*s,.03*s);c.stroke()}else{c.ellipse(xx*s,.03*s,s*.03,s*.039,0,0,TAU);c.fill()}}
    c.beginPath();c.moveTo(-s*.05,s*.15);c.quadraticCurveTo(0,s*.21,s*.05,s*.15);c.stroke();c.restore()
  }
  drawParticles(){
    const c=this.ctx,p=this.particles,s=this.camera.scale
    for(let i=0;i<p.capacity;i++){
      if(p.life[i]<=0)continue
      const x=this.px(p.x[i],p.z[i]),y=this.py(p.y[i],p.z[i]),r=p.size[i]*s,t=p.life[i]/p.duration[i]
      if(x<-25||x>this.width+25||y<-25||y>this.height+25)continue
      c.globalAlpha=Math.min(1,t*1.5)
      if(p.kind[i]===3){c.globalAlpha=Math.sin(t*Math.PI)*.24;c.fillStyle='#fffceb';c.beginPath();c.ellipse(x,y,r*(2-t),r*(2.5-t),0,0,TAU);c.fill()}
      else if(p.kind[i]===2)sparkle(c,x,y,r*1.7,'#e4b361')
      else if(p.kind[i]===1){c.save();c.translate(x,y);c.rotate(p.rotation[i]);c.fillStyle='#fff6dc';c.beginPath();c.moveTo(-r,r*.6);c.lineTo(0,-r);c.lineTo(r,r*.4);c.closePath();c.fill();c.restore()}
      else{c.fillStyle='#f9edcc';c.beginPath();c.arc(x,y,r,0,TAU);c.fill()}
    }
    c.globalAlpha=1;c.textAlign='center'
    for(const label of this.labels.slots){
      if(label.life<=0)continue
      c.globalAlpha=Math.min(1,label.life*3);c.font=`700 ${label.bonus?12:17}px 'Trebuchet MS',sans-serif`
      const x=this.px(label.x,label.z),y=this.py(label.y,label.z)-(1-label.life)*28
      c.strokeStyle='#fff7df';c.lineWidth=4;c.strokeText(label.text,x,y);c.fillStyle=label.bonus?'#a4743d':INK;c.fillText(label.text,x,y)
    }
    c.globalAlpha=1
  }

  render(dt,previous,current,alpha,phase){
    if(this.disposed)return
    const snapshot=current??this.preview,prev=previous??snapshot,t=phase==='playing'?alpha:1
    const pose=interpolateSnapshots(prev,snapshot,t),step=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0))
    this.time+=step;this.launchFlash=Math.max(0,this.launchFlash-step)
    this.scene.update(prev,snapshot,t)
    const effect=this.juice.update(step,snapshot,this.pendingEvents);this.pendingEvents.length=0
    for(const event of effect.events){
      if(event.kind==='launch'){
        this.lastLaunchTick=event.tick;this.launchFlash=.8
        if(!this.reducedMotion){this.particles.spawn(event.position.x,event.position.y,'spark',this.quality==='low'?10:28,event.position.z);this.labels.spawn(event.position.x,event.position.y+1.1,'POP!',true,event.position.z)}
      }else if(!this.reducedMotion&&(event.kind==='jump'||event.kind==='land'||event.kind==='hard-land'))this.particles.spawn(event.position.x,event.position.y-.4,'dust',this.quality==='low'?5:12,event.position.z)
    }
    if(!this.reducedMotion){
      this.steamDebt+=step*(this.quality==='low'?4:this.scene.steamActive?18:10)
      const count=Math.min(3,Math.floor(this.steamDebt));this.steamDebt-=count
      if(count){const zone=LEVEL.continuousForceZones[0];this.particles.spawn(zone.center[0]+Math.sin(this.time)*.75,zone.center[1]-.8,'steam',count,zone.center[2])}
    }
    this.particles.update(step);this.labels.update(step)
    const follow=1-Math.exp(-4*step),ready=phase==='ready'||phase==='loading'
    const scale=this.overview?this.overviewScale():this.followScale()
    const target=this.overview?{x:18,y:ready?this.readyY(scale):4,z:-4,scale}:{x:pose.position.x+1.7,y:ready?this.readyY(scale):Math.max(2.5,pose.position.y+.5),z:pose.position.z,scale}
    if(phase!=='over')for(const key of ['x','y','z','scale'])this.camera[key]+=(target[key]-this.camera[key])*follow
    const c=this.ctx,shake=this.failShake.update(step)
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle=this.sky;c.fillRect(0,0,this.width,this.height);c.save()
    if(!this.reducedMotion)c.translate((effect.shake.x+shake.x)*this.camera.scale,(effect.shake.y+shake.y)*this.camera.scale)
    this.drawRoom();this.drawSteam();this.prepareFaces(pose)
    for(const item of this.queue){if(item.kind==='egg')this.drawEgg(pose,effect,snapshot,phase);else if(item.visible)this.drawFace(item)}
    this.drawGoal();this.drawParticles()
    const lift=LEVEL.kinematicBoxes[0],launch=LEVEL.launchZones[0],steam=LEVEL.continuousForceZones[0]
    this.tag('TOASTER · POP',launch.center[0],launch.center[1]+1.05,launch.center[2],this.launchFlash>0)
    this.tag('STEAM · LIFT',steam.center[0],steam.center[1]+2.95,steam.center[2],this.scene.steamActive)
    this.tag('MOVING CABINET',lift.center[0],this.scene.cabinetY+1.3,lift.center[2],false)
    c.restore()
  }
  dispose(){
    if(this.disposed)return
    this.disposed=true;this.particles.reset();this.labels.reset();this.pendingEvents.length=0
    for(const texture of this.materials.values()){texture.width=1;texture.height=1}this.materials.clear()
    this.floor.canvas.width=1;this.wall.canvas.width=1;this.canvas.width=1;this.canvas.height=1
  }
}
