import { WorkerSimulationHost } from '../dist/host/worker-client.js'
import { InputState } from '../dist/game/input-state.js'
import { bindGameInput, isInteractiveTarget } from '../dist/game/browser-input.js'
import { SafeStorage, isBestScore } from '../dist/game/storage.js'
import { FrameMeter } from '../dist/render/arcade-effects.js'
import { gameMode } from './modes.js'

const mode = gameMode(document.body.dataset.mode)

const $ = id => document.getElementById(id)
const canvas=$('gameCanvas'),stage=$('gameStage')
const ui={height:$('height'),score:$('score'),best:$('bestScore'),status:$('gameStatus'),start:$('startButton'),startLabel:$('startLabel'),onboarding:$('onboarding'),pause:$('pauseButton'),restart:$('restartButton'),combo:$('combo'),performance:$('performance')}
const resultDialog=$('resultDialog'),pauseDialog=$('pauseDialog'),helpDialog=$('helpDialog')
const storage=new SafeStorage(),input=new InputState(),cadenceMeter=new FrameMeter(),presentationMeter=new FrameMeter()
const lifetime=new AbortController(),signal=lifetime.signal
const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)')
let reducedMotion=motionQuery.matches||storage.read('egg-climb-reduced-motion',false,value=>typeof value==='boolean')
let best=storage.read(mode.bestKey,0,isBestScore)
let game=null,host=null,view=null,disposeInput=()=>{}
let disposed=false,rafId=0,lastTime=0,lastPresentedTime=0,hudTime=0,perfTime=0,settleTime=0,slowWindows=0,fastWindows=0
let helpActive=false,resumeAfterHelp=false
const text=(element,value)=>{if(element.textContent!==value)element.textContent=value}
const listen=(element,type,fn)=>element.addEventListener(type,fn,{signal})
const closeDialogs=()=>{for(const dialog of [resultDialog,pauseDialog,helpDialog])if(dialog.open)dialog.close()}
const focusCanvas=()=>canvas.focus({preventScroll:true})

function stopLoop(){if(rafId)cancelAnimationFrame(rafId);rafId=0;lastTime=0}
function startLoop(){if(disposed||document.hidden||rafId||!view)return;lastTime=performance.now();rafId=requestAnimationFrame(frame)}
function updateHud(){
  const score=game?.score??{heightMm:0,points:0,combo:0}
  text(ui.height,(score.heightMm/1000).toFixed(1));text(ui.score,String(score.points).padStart(5,'0'));text(ui.best,String(best).padStart(5,'0'))
  ui.combo.hidden=score.combo===0
  if(score.combo>0)text(ui.combo.lastElementChild,`×${score.combo}`)
  stage.dataset.tick=String(game?.current?.tick??0);stage.dataset.queue=String(game?.pendingCount??0)
  stage.dataset.grounded=String(game?.current?.physics.grounded??false);stage.dataset.x=String(game?.current?.position.x??0)
  stage.dataset.z=String(game?.current?.position.z??0);stage.dataset.mode=mode.id
  stage.dataset.level=game?.current?.identity.levelId??mode.level.id
  stage.dataset.levelHash=game?.current?.identity.levelHash??mode.level.hash
  stage.dataset.particles=String(view?.particles.activeCount??0);stage.dataset.quality=view?.quality??'high';stage.dataset.dpr=String(view?.dpr??1)
  stage.dataset.profile=canvas.dataset.maxProfile??'default';stage.dataset.renderStride=canvas.dataset.renderStride??'1'
  for(const mark of document.querySelectorAll('[data-milestone]'))mark.classList.toggle('reached',score.heightMm>=Number(mark.dataset.milestone)*1000)
  for(const button of document.querySelectorAll('[data-game-action]'))button.classList.toggle('is-held',input.held(button.dataset.gameAction))
  if(mode.id==='kitchen'){
    const x=game?.current?.position.x??10,done=game?.reason==='finish',visual=view?.telemetry
    for(const mark of document.querySelectorAll('[data-route-x]'))mark.classList.toggle('reached',mark.dataset.routeGoal==='true'?done:done||x>=Number(mark.dataset.routeX))
    const progress=Math.max(0,Math.min(99,(x-10)/17*100))
    $('routeProgress').value=done?100:progress;text($('routePercent'),`${done?100:Math.round(progress)}%`)
    text($('runTime'),`${((game?.current?.tick??0)/60).toFixed(1)}s`)
    if(visual){
      stage.dataset.cabinetY=visual.cabinetY.toFixed(4);stage.dataset.steamActive=String(visual.steamActive)
      stage.dataset.lastLaunchTick=String(visual.lastLaunchTick);stage.dataset.completionTick=String(game?.current?.gameplay.completionTick??'')
      text($('steamStatus'),visual.steamActive?'LIFTING':'READY')
      $('steamReadout').classList.toggle('active',visual.steamActive)
      const launched=visual.lastLaunchTick>=0&&(game?.current?.tick??0)-visual.lastLaunchTick<50
      text($('toasterStatus'),launched?'POP!':'READY');$('toasterReadout').classList.toggle('active',launched)
      text($('cabinetStatus'),`${visual.cabinetY.toFixed(1)} m`)
      $('overviewButton').setAttribute('aria-pressed',String(visual.overview))
      $('overviewButton').setAttribute('aria-label',visual.overview?'Follow the egg':'View the kitchen')
    }
  }
}
function setMotion(value){
  const locked=canvas.dataset.motionLocked==='true',effective=locked?true:Boolean(value),button=$('motionButton')
  reducedMotion=effective;document.body.classList.toggle('reduced-motion',effective)
  button.disabled=locked;button.setAttribute('aria-pressed',String(effective))
  button.setAttribute('aria-label',locked?'Reduced motion locked for performance':effective?'Enable full motion':'Reduce motion')
  button.title=locked?'Reduced motion is fixed in the constrained performance profile':effective?'Enable full motion':'Reduce motion'
  view?.setReducedMotion(effective);if(!locked)storage.write('egg-climb-reduced-motion',effective)
}
function showError(message){
  stopLoop();input.reset();ui.onboarding.hidden=true;ui.pause.disabled=true;ui.restart.disabled=true
  closeDialogs();text($('errorMessage'),message);$('errorPanel').hidden=false;$('reloadButton').focus({preventScroll:true})
}
function onPhase(phase){
  if(disposed)return
  document.body.dataset.phase=phase
  view?.onPhase?.(phase)
  ui.pause.disabled=phase!=='playing';ui.restart.disabled=phase==='loading'||phase==='resetting'||phase==='error'
  ui.onboarding.hidden=phase!=='ready'&&phase!=='loading'
  if(phase==='ready'){
    input.reset();view?.reset(game?.current);cadenceMeter.reset();presentationMeter.reset();lastPresentedTime=0;closeDialogs();helpActive=false
    ui.start.disabled=false;text(ui.startLabel,mode.startLabel);text(ui.status,'READY WHEN YOU ARE');settleTime=0;startLoop()
  }else if(phase==='playing'){
    closeDialogs();text(ui.status,mode.running);cadenceMeter.reset();presentationMeter.reset();lastPresentedTime=0;hudTime=0;perfTime=0;lastTime=performance.now();focusCanvas();startLoop()
  }else if(phase==='paused'){
    input.cancel();stopLoop();view?.render(0,game?.current,game?.current,1,'paused');text(ui.status,'TAKE A BREATHER')
    if(!helpActive&&!pauseDialog.open)pauseDialog.showModal()
  }else if(phase==='over'){
    input.reset();view?.end(game.reason);settleTime=1.25;text(ui.status,game.reason===mode.winReason?mode.winLabel:'EVERY FALL IS A FRESH START')
    const newBest=game.score.points>best
    if(newBest){best=game.score.points;$('storageNote').hidden=storage.write(mode.bestKey,best);view?.record()}
    $('recordBadge').hidden=!newBest
    text($('endLabel'),game.reason===mode.winReason?mode.winLabel:game.reason==='timeout'?'TIME TO REST':'GAME OVER')
    text($('resultTitle'),game.reason===mode.winReason?mode.winTitle:'A cracking good run.')
    text($('resultCopy'),game.reason===mode.winReason?mode.winCopy:game.reason==='timeout'?'Three minutes of little leaps. Ready for another?':'Every fall is a fresh start.')
    text($('resultHeight'),`${(game.score.heightMm/1000).toFixed(1)} m`);text($('resultScore'),String(game.score.points));text($('resultBest'),String(best))
    closeDialogs();resultDialog.showModal();$('playAgainButton').focus({preventScroll:true});startLoop()
  }else if(phase==='resetting'){
    stopLoop();input.reset();view?.reset();closeDialogs();text(ui.status,mode.reset);ui.start.disabled=true
  }else if(phase==='error'){
    showError('The simulation stopped responding. Reload to start a fresh climb.')
  }
  updateHud()
}
async function restart(autoStart=false){
  if(disposed||!game)return
  helpActive=false
  await game.restart()
  if(game.phase==='ready'&&autoStart)game.start()
  else if(game.phase==='ready')ui.start.focus({preventScroll:true})
}
function frame(now){
  rafId=0
  if(disposed||document.hidden||!view)return
  const workStart=performance.now(),dt=lastTime?(now-lastTime)/1000:0
  lastTime=now
  game?.tick(dt,()=>input.sample(mode.planar))
  const presented=view.render(dt,game?.previous,game?.current,game?.alpha??1,game?.phase??'loading')!==false
  hudTime+=Math.min(dt,0.1);perfTime+=dt
  if(hudTime>=0.1){hudTime=0;updateHud()}
  const workMs=performance.now()-workStart
  if(dt>0){
    cadenceMeter.record(dt*1000,workMs)
    if(presented){
      if(lastPresentedTime) presentationMeter.record(now-lastPresentedTime,workMs)
      lastPresentedTime=now
    }
  }
  if(perfTime>=1){
    perfTime=0
    const cadence=cadenceMeter.summary(),presentation=presentationMeter.summary()
    const fps=presentation.frames?presentation.fps:0
    const showCadence=cadence.frames>0&&Math.abs(cadence.fps-fps)>=2
    const profile=canvas.dataset.maxProfile?'MAX':'LOCAL'
    text(ui.performance,`${fps.toFixed(0)} FPS${showCadence?` · ${cadence.fps.toFixed(0)} Hz`:''} · ${view.quality.toUpperCase()} · ${profile}`)
    stage.dataset.fps=fps.toFixed(2);stage.dataset.rafFps=cadence.fps.toFixed(2)
    stage.dataset.frameP95=presentation.p95Ms.toFixed(2);stage.dataset.rafP95=cadence.p95Ms.toFixed(2);stage.dataset.workP95=presentation.workP95Ms.toFixed(2)
    if(!canvas.dataset.maxProfile&&cadence.frames>=45){
      if(cadence.fps<57){slowWindows++;fastWindows=0}else if(cadence.fps>=59&&cadence.p95Ms<19){fastWindows++;slowWindows=0}else{slowWindows=0;fastWindows=0}
      if(slowWindows>=2){view.setQuality(view.quality==='high'?'medium':'low');slowWindows=0}
      if(fastWindows>=8){view.setQuality(view.quality==='low'?'medium':'high');fastWindows=0}
    }
  }
  if(game?.phase==='over'){settleTime-=Math.min(dt,0.1);if(settleTime<=0){updateHud();return}}
  if(game?.phase==='error'||game?.phase==='disposed'||game?.phase==='paused')return
  rafId=requestAnimationFrame(frame)
}

if($('overviewButton'))listen($('overviewButton'),'click',()=>{view?.setOverview(!view.overview);updateHud();focusCanvas();if(game?.phase==='paused')view.render(0,game.current,game.current,1,'paused')})
listen(ui.start,'click',()=>game?.start())
listen(ui.pause,'click',()=>game?.pause())
listen(ui.restart,'click',()=>void restart())
listen($('playAgainButton'),'click',()=>void restart(true))
listen($('resultHomeButton'),'click',()=>void restart())
listen($('pauseRestartButton'),'click',()=>void restart(true))
listen($('resumeButton'),'click',()=>game?.resume())
listen($('reloadButton'),'click',()=>location.reload())
listen($('motionButton'),'click',()=>setMotion(!reducedMotion))
listen(motionQuery,'change',event=>setMotion(event.matches))
listen(window,'keydown',event=>{
  if(event.code!=='Escape'&&event.code!=='KeyP')return
  if(isInteractiveTarget(event.target)||resultDialog.open||pauseDialog.open||helpDialog.open)return
  if(game?.phase==='playing'){event.preventDefault();game.pause()}
})
listen(resultDialog,'cancel',event=>{event.preventDefault();void restart()})
listen(pauseDialog,'cancel',event=>{event.preventDefault();game?.resume()})
function closeHelp(){
  helpDialog.close();helpActive=false
  if(resumeAfterHelp&&game?.phase==='paused')game.resume()
  else if(game?.phase==='paused')pauseDialog.showModal()
  else ui.start.focus({preventScroll:true})
}
listen($('helpButton'),'click',()=>{
  helpActive=true;resumeAfterHelp=game?.phase==='playing'
  if(resumeAfterHelp)game.pause()
  if(pauseDialog.open)pauseDialog.close()
  helpDialog.showModal()
})
listen($('closeHelpButton'),'click',closeHelp)
listen(helpDialog,'cancel',event=>{event.preventDefault();closeHelp()})
listen(document,'visibilitychange',()=>{
  if(document.hidden){input.cancel();game?.pause();stopLoop()}
  else if(game?.phase==='ready'||game?.phase==='playing')startLoop()
})
listen(canvas,'contextlost',event=>{event.preventDefault();input.cancel();game?.pause();stopLoop()})
listen(canvas,'contextrestored',()=>{resize();if(game?.phase==='ready')startLoop()})
let resizeObserver=null
function resize(){if(!view||disposed)return;const rect=stage.getBoundingClientRect();view.resize(Math.max(1,rect.width-2),Math.max(1,rect.height-2));updateHud();if(game?.phase==='paused'||game?.phase==='over')view.render(0,game.current,game.current,1,game.phase)}
listen(window,'resize',resize)
function dispose(){
  if(disposed)return
  disposed=true;stopLoop();lifetime.abort();resizeObserver?.disconnect();disposeInput();input.reset()
  host?.terminate();void game?.dispose();view?.dispose()
}
window.addEventListener('pagehide',dispose,{once:true})
window.addEventListener('pageshow',event=>{if(event.persisted&&disposed)location.reload()})

try{
  const View=await mode.loadView()
  if(disposed)throw new Error('Client closed during loading')
  view=new View(canvas);setMotion(reducedMotion);resize()
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage)
  host=new WorkerSimulationHost(new URL(mode.worker,import.meta.url),mode.preset,mode.feel,mode.level)
  game=new mode.Run(host,{onPhase,onFrame:(frame,score,oldScore)=>view.accept(frame,score,oldScore)})
  disposeInput=bindGameInput(input,{active:()=>game?.phase==='playing',onCancel:()=>game?.pause()})
  startLoop();await game.init()
  if(!disposed&&game.phase==='ready')ui.start.focus({preventScroll:true})
}catch{
  host?.terminate();if(!disposed)showError('This browser could not start the game. Please reload or try an updated browser.')
}
