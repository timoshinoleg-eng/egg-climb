// Reproducible 60 Hz mobile-viewport smoke. Reports wall-clock cadence separately
// from JavaScript work; it is not a claim about all mobile hardware/GPU models.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const kitchen=process.argv.includes('--kitchen')
const browser=await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
})
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true})
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(process.env.PLAYTEST_URL??`http://127.0.0.1:4173/${kitchen?'play/kitchen.html':''}`)
  await page.locator('#startButton').click()
  if(kitchen)await page.locator('#overviewButton').click()
  await page.waitForTimeout(2000)
  const sample=page.evaluate(()=>new Promise(resolve=>{
    const times=[];let start=null,previous=null,initialTick=0
    const frame=now=>{
      if(start===null){start=previous=now;initialTick=Number(document.getElementById('gameStage').dataset.tick);requestAnimationFrame(frame);return}
      times.push(now-previous);previous=now;if(now-start<6000)requestAnimationFrame(frame);else{
      const sorted=[...times].sort((a,b)=>a-b),stage=document.getElementById('gameStage')
      resolve({phase:document.body.dataset.phase,physicsTicks:Number(stage.dataset.tick)-initialTick,queued:Number(stage.dataset.queue),frames:times.length,durationMs:now-start,fps:times.length*1000/(now-start),p95Ms:sorted[Math.ceil(sorted.length*0.95)-1],maxMs:sorted.at(-1),overBudgetFrames:times.filter(ms=>ms>20).length,renderWorkP95Ms:Number(stage.dataset.workP95),quality:stage.dataset.quality,dpr:Number(stage.dataset.dpr),particles:stage.dataset.particles})
    }};requestAnimationFrame(frame)
  }))
  // Repeated real jumps exercise spring, particles, labels and worker transport.
  for(let i=0;i<6;i++){await page.keyboard.press('Space');await page.waitForTimeout(800)}
  const result={mode:await page.locator('body').getAttribute('data-mode'),overview:kitchen?await page.locator('#overviewButton').getAttribute('aria-pressed')==='true':false,browser:await browser.version(),viewport:{width:390,height:844,deviceScaleFactor:2},...(await sample),errors}
  result.pass=result.fps>=58.5&&result.p95Ms<=20&&result.renderWorkP95Ms<8&&result.phase==='playing'&&result.physicsTicks>=330&&result.queued<=8&&(!kitchen||result.overview)&&errors.length===0
  await mkdir('test-results',{recursive:true})
  await writeFile(`test-results/${kitchen?'kitchen':'arcade'}-performance.json`,JSON.stringify(result,null,2)+'\n')
  await page.screenshot({path:`test-results/${kitchen?'kitchen':'arcade'}-performance.png`})
  console.log(JSON.stringify(result,null,2))
  if(!result.pass)process.exitCode=1
}finally{await browser.close()}
