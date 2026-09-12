import { sprite } from './egg-art.js'
import { ARCADE_INITIAL_EGG, ARCADE_LEVEL } from '../dist/game/arcade-level.js'
import { interpolateSnapshots } from '../dist/render/interpolate.js'
import { Juice, TraumaShake } from '../dist/render/juice.js'
import { ParticlePool, FloatingLabels, canvasPixelRatio } from '../dist/render/arcade-effects.js'

const INK = '#355b43'
const GOLD = '#e9bd63'
const TAU = Math.PI * 2

function cloud(ctx, x, y, scale, opacity = 1) {
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale); ctx.globalAlpha = opacity
  ctx.fillStyle = '#fffef0'; ctx.beginPath(); ctx.moveTo(-60,12)
  ctx.bezierCurveTo(-84,10,-78,-15,-53,-14); ctx.bezierCurveTo(-60,-44,-14,-52,-1,-23)
  ctx.bezierCurveTo(20,-41,51,-24,49,-5); ctx.bezierCurveTo(79,-9,89,13,59,16)
  ctx.bezierCurveTo(26,19,-33,20,-60,12); ctx.fill(); ctx.restore()
}
function leaf(ctx,x,y,size,angle,color) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle)
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0,0)
  ctx.bezierCurveTo(-size*0.2,-size*0.7,size*0.6,-size*1.1,size,-size)
  ctx.bezierCurveTo(size*1.04,-size*0.35,size*0.5,size*0.18,0,0); ctx.fill(); ctx.restore()
}
function star(ctx,x,y,r,color) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(x,y-r)
  ctx.quadraticCurveTo(x+r*0.2,y-r*0.2,x+r,y);ctx.quadraticCurveTo(x+r*0.2,y+r*0.2,x,y+r)
  ctx.quadraticCurveTo(x-r*0.2,y+r*0.2,x-r,y);ctx.quadraticCurveTo(x-r*0.2,y-r*0.2,x,y-r);ctx.fill()
}

/** Canvas is a read-only projection of Rapier, not another physics implementation. */
export class GardenView {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    if (!this.ctx) throw new Error('Canvas 2D is unavailable')
    this.backdrop = document.createElement('canvas')
    this.juice = new Juice(); this.failShake = new TraumaShake()
    this.particles = new ParticlePool(128); this.labels = new FloatingLabels()
    this.pendingEvents = []
    this.width=1; this.height=1; this.dpr=1; this.unit=1; this.cameraY=0
    this.time=0; this.quality='high'; this.reducedMotion=false; this.disposed=false; this.ended=false
    this.lastVisible={x:0,y:0.72}
    this.preview={position:{x:0,y:ARCADE_INITIAL_EGG.position[1],z:0},rotation:{x:0,y:0,z:0,w:1},linearVelocity:{x:0,y:0,z:0}}
  }
  resize(width,height) {
    if (this.disposed) return
    this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height))
    this.dpr=canvasPixelRatio(window.devicePixelRatio || 1,this.quality)
    this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr)
    this.backdrop.width=this.canvas.width;this.backdrop.height=this.canvas.height
    this.unit=Math.min(this.width/10.8,this.height/7.7)
    this.paintBackdrop()
  }
  setQuality(quality) {
    if (!['low','medium','high'].includes(quality) || quality===this.quality) return
    this.quality=quality;this.resize(this.width,this.height)
  }
  setReducedMotion(reduced) {
    this.reducedMotion=reduced
    this.juice.reset();this.failShake.reset();this.particles.reset();this.labels.reset();this.pendingEvents.length=0
  }
  reset(snapshot) {
    this.juice.reset(snapshot?.position.y ?? 0.72);this.failShake.reset();this.particles.reset();this.labels.reset()
    this.pendingEvents.length=0;this.cameraY=0;this.time=0;this.ended=false
    this.lastVisible={x:snapshot?.position.x ?? 0,y:snapshot?.position.y ?? 0.72}
  }
  accept(frame,score,previousScore) {
    if (this.disposed) return
    for(const event of frame.events) if(this.pendingEvents.length<64) this.pendingEvents.push(event)
    const {x,y}=frame.current.position
    if (this.reducedMotion) return
    const oldBand=Math.floor(previousScore.heightMm/500);const band=Math.floor(score.heightMm/500)
    if(band>oldBand) this.labels.spawn(x,y+0.9,`+${(band-oldBand)*50}`)
    if(score.bonus>previousScore.bonus) {
      this.labels.spawn(x,y+1.2,score.combo>1?'GREAT!':'NICE LANDING',true)
      this.particles.spawn(x,y,'spark',this.quality==='low'?8:18)
    }
  }
  record() {
    if(this.reducedMotion) return
    this.particles.spawn(this.lastVisible.x,this.lastVisible.y,'spark',this.quality==='low'?12:40)
  }
  end(reason) {
    this.ended=true
    if(this.reducedMotion) return
    if(reason==='fall') {this.failShake.add(0.8);this.particles.spawn(this.lastVisible.x,this.lastVisible.y,'shell',this.quality==='low'?18:40)}
    else this.record()
  }
  projectX(x) { return this.width*0.5+x*this.unit }
  projectY(y) { return this.height*0.63-(y-this.cameraY)*this.unit }

  paintBackdrop() {
    const ctx=this.backdrop.getContext('2d');if(!ctx)return
    const w=this.width,h=this.height
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0)
    const sky=ctx.createLinearGradient(0,0,w*0.5,h);sky.addColorStop(0,'#d3e2d2');sky.addColorStop(0.6,'#e0e8cc');sky.addColorStop(1,'#e9e8c8')
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h)
    ctx.fillStyle='#f9ecc180';ctx.beginPath();ctx.arc(w*0.8,h*0.17,Math.min(w*0.12,65),0,TAU);ctx.fill()
    ctx.strokeStyle='#fffced77';ctx.lineWidth=1;ctx.beginPath();ctx.arc(w*0.8,h*0.17,Math.min(w*0.12,65)+11,0,TAU);ctx.stroke()
    cloud(ctx,w*0.18,h*0.17,w/650,0.56);cloud(ctx,w*0.79,h*0.35,w/850,0.58)
    cloud(ctx,w*0.5,h*0.47,w/900,0.34);cloud(ctx,w*0.07,h*0.65,w/650,0.36)
    ctx.fillStyle='#afc49b35';ctx.beginPath();ctx.moveTo(0,h*0.85)
    ctx.bezierCurveTo(w*0.18,h*0.6,w*0.26,h*0.9,w*0.52,h*0.79);ctx.bezierCurveTo(w*0.7,h*0.66,w*0.9,h*0.68,w,h*0.77)
    ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill()
    ctx.fillStyle='#8da77d20';ctx.beginPath();ctx.moveTo(0,h*0.92);ctx.bezierCurveTo(w*0.27,h*0.72,w*0.43,h*0.99,w*0.73,h*0.87);ctx.quadraticCurveTo(w*0.9,h*0.8,w,h*0.9);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill()
    for(const side of [0,1]) {
      const x=side?w+12:-12
      ctx.strokeStyle='#8ca87933';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,h);ctx.quadraticCurveTo(x+(side?-70:70),h*0.79,x+(side?-26:26),h*0.55);ctx.stroke()
      for(let i=0;i<8;i++) leaf(ctx,x+(side?-1:1)*(15+Math.sin(i*0.5)*23),h*(0.93-i*0.044),30-i*1.6,side?-1.3:0.2,'#89a57435')
    }
    // Paper grain is baked once on resize, never a per-frame fullscreen filter.
    ctx.fillStyle='#547b4210'
    for(let i=0;i<1600;i++) {const x=((i*167.71)%w),y=((i*83.317)%h);ctx.fillRect(x,y,0.7,0.7)}
    for(const [x,y,r] of [[0.13,0.34,4],[0.6,0.12,5],[0.87,0.61,3],[0.4,0.32,3]])star(ctx,w*x,h*y,r,'#faffefbb')
  }

  drawPlatform(box,index) {
    const c=this.ctx,u=this.unit
    const x=this.projectX(box.center[0]-box.halfExtents[0]),top=this.projectY(box.center[1]+box.halfExtents[1])
    const w=box.halfExtents[0]*2*u,depth=box.halfExtents[1]*2*u
    if(top>this.height+130 || top+depth<-60)return
    c.save()
    c.fillStyle='#46653612';c.beginPath();c.ellipse(x+w*0.5,top+depth+15,w*0.46,7,0,0,TAU);c.fill()
    // A moss cap aligns exactly to the authoritative box top.
    const soil=c.createLinearGradient(0,top,0,top+depth+10)
    soil.addColorStop(0,index===0?'#b5a075':'#c0b58c');soil.addColorStop(1,index===0?'#9c8f66':'#aaa17e')
    c.fillStyle=soil;c.strokeStyle='#6e835380';c.lineWidth=1
    c.beginPath();c.roundRect(x,top,w,Math.max(depth,9),[5,5,9,9]);c.fill();c.stroke()
    c.fillStyle=index===0?'#91a86b':'#9cb875';c.beginPath();c.roundRect(x-2,top-2,w+4,7,[4,4,3,3]);c.fill()
    c.fillStyle='#d0dda0';c.fillRect(x+7,top-1,w-14,2)
    c.fillStyle='#e9dcad6b'
    for(let k=0;k<(index===0?10:5);k++)c.fillRect(x+14+(k*23)%(Math.max(1,w-27)),top+Math.min(depth*0.5,12)+(k%2)*3,3+(k%3),2)
    if(index===0) {
      for(let k=0;k<5;k++) {
        const px=x+w*(0.1+k*0.19),len=14+(k%3)*7
        c.strokeStyle='#6c8c53';c.lineWidth=1.4;c.beginPath();c.moveTo(px,top+depth-1);c.quadraticCurveTo(px-3,top+depth+len*0.6,px+4,top+depth+len);c.stroke()
        leaf(c,px+3,top+depth+len*0.7,9,1.2,'#819954');leaf(c,px,top+depth+len*0.45,8,-1.2,'#79904e')
      }
      c.fillStyle='#6c7550';c.font=`600 ${Math.max(8,u*0.13)}px 'Trebuchet MS',sans-serif`;c.textAlign='center';c.fillText('THE NEST',x+w*0.5,top+depth*0.64)
    }
    const plantX=x+(index%2?w*0.83:w*0.13),plantSize=Math.max(8,u*0.18)
    c.strokeStyle='#627c47';c.lineWidth=1.3;c.beginPath();c.moveTo(plantX,top-2);c.lineTo(plantX,top-plantSize*1.4);c.stroke()
    leaf(c,plantX,top-plantSize*0.5,plantSize,-0.22,'#799655');leaf(c,plantX,top-plantSize*0.75,plantSize*0.8,-1.65,'#65894d')
    if(index%3===0){c.fillStyle='#f6ddb0';c.beginPath();c.arc(plantX,top-plantSize*1.6,3,0,TAU);c.fill()}
    c.restore()
  }

  drawEgg(pose,effect,snapshot,phase) {
    const c=this.ctx,u=this.unit,x=this.projectX(pose.position.x),y=this.projectY(pose.position.y)
    if(x>-10&&x<this.width+10&&y>0&&y<this.height-20) {this.lastVisible.x=pose.position.x;this.lastVisible.y=pose.position.y}
    if(this.ended&&phase==='over')return
    if(snapshot.physics?.grounded || phase==='ready'||phase==='loading') {
      c.fillStyle='#3a5a3520';c.beginPath();c.ellipse(x,y+u*0.51,u*0.42,u*0.06,0,0,TAU);c.fill()
    }
    c.save();c.translate(x,y);c.rotate(-2*Math.atan2(pose.rotation.z,pose.rotation.w))
    if(!this.reducedMotion)c.scale(effect.squash.x,effect.squash.y)
    c.drawImage(sprite,-u*0.64,-u*0.96,u*1.28,u*1.6)
    const blink=!this.reducedMotion&&(this.time%4.7)>4.55
    const falling=snapshot.linearVelocity.y<-3
    c.fillStyle=INK;c.strokeStyle=INK;c.lineWidth=Math.max(1,u*0.017);c.lineCap='round'
    for(const eyeX of [-0.135,0.135]) {
      c.beginPath()
      if(blink){c.moveTo((eyeX-0.026)*u,0.038*u);c.lineTo((eyeX+0.026)*u,0.038*u);c.stroke()}
      else {c.ellipse(eyeX*u,0.03*u,0.029*u,(falling?0.042:0.037)*u,0,0,TAU);c.fill();c.fillStyle='#ffffffcc';c.beginPath();c.arc((eyeX-0.008)*u,0.013*u,0.008*u,0,TAU);c.fill();c.fillStyle=INK}
    }
    c.beginPath()
    if(falling){c.ellipse(0,0.165*u,0.027*u,0.035*u,0,0,TAU);c.fill()}
    else {c.moveTo(-0.05*u,0.155*u);c.quadraticCurveTo(0,0.21*u,0.05*u,0.155*u);c.stroke()}
    c.restore()
    if((phase==='ready'||phase==='loading')&&!this.reducedMotion){
      const bob=Math.sin(this.time*2)*3
      star(c,x-u*0.87,y-u*0.3+bob,4,'#f6f9e2');star(c,x+u*0.74,y-u*0.6-bob,5,GOLD)
    }
  }

  drawParticles() {
    const c=this.ctx,p=this.particles,u=this.unit
    for(let i=0;i<p.capacity;i++) {
      if(p.life[i]<=0)continue
      const x=this.projectX(p.x[i]),y=this.projectY(p.y[i]),r=p.size[i]*u
      c.globalAlpha=Math.min(1,p.life[i]/p.duration[i]*1.5)
      if(p.kind[i]===1){c.save();c.translate(x,y);c.rotate(p.rotation[i]);c.fillStyle='#fff6d9';c.strokeStyle='#b9a375';c.lineWidth=0.8;c.beginPath();c.moveTo(-r,r*0.5);c.lineTo(0,-r);c.lineTo(r*0.7,r*0.7);c.closePath();c.fill();c.stroke();c.restore()}
      else if(p.kind[i]===2)star(c,x,y,r*1.5,GOLD)
      else {c.fillStyle='#e8efd0';c.beginPath();c.arc(x,y,r,0,TAU);c.fill()}
    }
    c.globalAlpha=1
    c.textAlign='center';c.textBaseline='middle'
    for(const label of this.labels.slots) {
      if(label.life<=0)continue
      c.globalAlpha=Math.min(1,label.life*3)
      c.font=`700 ${label.bonus?13:18}px 'Trebuchet MS',sans-serif`
      const x=this.projectX(label.x),y=this.projectY(label.y)-(1-label.life)*35
      c.lineWidth=4;c.strokeStyle='#f7f9e6';c.strokeText(label.text,x,y);c.fillStyle=label.bonus?'#9d7735':INK;c.fillText(label.text,x,y)
    }
    c.globalAlpha=1;c.textBaseline='alphabetic'
  }

  render(dt,previous,current,alpha,phase) {
    if(this.disposed)return false
    const snapshot=current??this.preview
    const pose=interpolateSnapshots(previous??snapshot,snapshot,phase==='playing'?alpha:1)
    const step=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,0.1))
    this.time+=step
    const effect=this.juice.update(step,snapshot,this.pendingEvents)
    this.pendingEvents.length=0
    if(!this.reducedMotion)for(const event of effect.events) {
      if(event.kind==='jump')this.particles.spawn(event.position.x,event.position.y-0.4,'dust',this.quality==='low'?6:13)
      else if(event.kind==='land'||event.kind==='hard-land')this.particles.spawn(event.position.x,event.position.y-0.4,'dust',this.quality==='low'?7:19)
    }
    this.particles.update(step);this.labels.update(step)
    const targetY=Math.max(0,pose.position.y-1.55)
    // Exponential lerp is independent of refresh rate; shake is never fed back.
    if(phase!=='over')this.cameraY+=(targetY-this.cameraY)*(1-Math.exp(-5.5*step))
    const shake=this.failShake.update(step),c=this.ctx
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.drawImage(this.backdrop,0,0,this.width,this.height)
    c.save()
    if(!this.reducedMotion)c.translate((effect.shake.x+shake.x)*this.unit,(effect.shake.y+shake.y)*this.unit)
    // Elevation guide uses the same world projection as the collider geometry.
    c.textAlign='right';c.font='8px ui-monospace,monospace';c.fillStyle='#6b855780';c.strokeStyle='#7c946440';c.lineWidth=1
    for(let meter=0;meter<=20;meter+=2){const y=this.projectY(meter);if(y>75&&y<this.height-45){c.beginPath();c.moveTo(this.width-18,y);c.lineTo(this.width-27,y);c.stroke();if(meter%4===0)c.fillText(`${meter} m`,this.width-32,y+3)}}
    for(let i=ARCADE_LEVEL.staticBoxes.length-1;i>=0;i--)this.drawPlatform(ARCADE_LEVEL.staticBoxes[i],i)
    this.drawEgg(pose,effect,snapshot,phase)
    this.drawParticles()
    if(!this.reducedMotion&&this.quality!=='low')for(let i=0;i<9;i++){
      const x=(i*79.7+this.time*4)%this.width,y=(i*113.37+Math.sin(this.time+i)*7)%this.height
      c.fillStyle='#fffeec99';c.beginPath();c.arc(x,y,i%3===0?1.7:1,0,TAU);c.fill()
    }
    c.restore()
    return true
  }
  dispose() {
    if(this.disposed)return
    this.disposed=true;this.particles.reset();this.labels.reset();this.pendingEvents.length=0
    this.canvas.width=1;this.canvas.height=1;this.backdrop.width=1;this.backdrop.height=1
  }
}
