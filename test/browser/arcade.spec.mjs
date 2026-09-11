import { expect, test } from '@playwright/test'

async function ready(page){
  await page.goto('/play/index.html')
  await expect(page.locator('body')).toHaveAttribute('data-phase','ready')
  await expect(page.getByRole('button',{name:"Let's climb"})).toBeEnabled()
}
async function start(page){
  await page.getByRole('button',{name:"Let's climb"}).click()
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-grounded','true')
}
async function scoreAndFall(page){
  await page.keyboard.press('Space')
  await expect.poll(async()=>Number(await page.locator('#score').textContent())).toBeGreaterThan(0)
  await page.keyboard.down('ArrowLeft')
  await expect(page.locator('body')).toHaveAttribute('data-phase','over',{timeout:15000})
  await page.keyboard.up('ArrowLeft')
}

test('arcade: start → real input → score → fall → Game Over → clean restart',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await ready(page);await start(page);await scoreAndFall(page)
  await expect(page.getByRole('dialog',{name:'A cracking good run.'})).toBeVisible()
  await expect(page.locator('#recordBadge')).toBeVisible()
  const tick=await page.locator('#gameStage').getAttribute('data-tick')
  const score=await page.locator('#score').textContent()
  await page.waitForTimeout(300)
  await expect(page.locator('#gameStage')).toHaveAttribute('data-tick',tick)
  await expect(page.locator('#score')).toHaveText(score)
  await page.screenshot({path:`test-results/arcade-result-${test.info().project.name}.png`})
  await page.getByRole('button',{name:'One more climb'}).click()
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  await expect(page.locator('#score')).toHaveText('00000')
  await expect(page.locator('#height')).toHaveText('0.0')
  await expect(page.locator('#combo')).toBeHidden()
  await expect.poll(async()=>Math.abs(Number(await page.locator('#gameStage').getAttribute('data-x')))).toBeLessThan(0.05)
  await expect(page.locator('#bestScore')).not.toHaveText('00000')
  expect(errors).toEqual([])
})

test('repeated blur pauses the round, clears held controls and resumes without wall-clock catch-up',async({page})=>{
  await ready(page);await start(page)
  await page.keyboard.down('Space')
  await page.keyboard.down('ArrowRight')
  await expect.poll(async()=>Number(await page.locator('#gameStage').getAttribute('data-x'))).toBeGreaterThan(0.1)
  await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('blur'))})
  await expect(page.locator('#pauseDialog')).toBeVisible()
  await expect(page.locator('[data-game-action="right"]')).not.toHaveClass(/is-held/)
  await expect(page.locator('#gameStage')).toHaveAttribute('data-queue','0')
  await page.waitForTimeout(150)
  const tick=Number(await page.locator('#gameStage').getAttribute('data-tick'))
  await page.waitForTimeout(350)
  expect(Number(await page.locator('#gameStage').getAttribute('data-tick'))).toBe(tick)
  await page.keyboard.up('Space');await page.keyboard.up('ArrowRight')
  await page.getByRole('button',{name:'Keep climbing'}).click()
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  await expect.poll(async()=>Number(await page.locator('#gameStage').getAttribute('data-tick'))).toBeGreaterThan(tick)
  expect(Number(await page.locator('#gameStage').getAttribute('data-tick'))-tick).toBeLessThan(45)
})

test('help and reduced-motion controls remain usable without changing the round',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await ready(page)
  await expect(page.locator('body')).toHaveClass(/reduced-motion/)
  await page.getByRole('button',{name:'How to play'}).click()
  await expect(page.locator('#helpDialog')).toBeVisible()
  await page.getByRole('button',{name:"Got it. Let's grow."}).click()
  await start(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('#pauseDialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  await page.keyboard.press('Space')
  await expect.poll(async()=>Number(await page.locator('#score').textContent())).toBeGreaterThan(0)
  await expect(page.locator('#gameStage')).toHaveAttribute('data-particles','0')
})

test('restart and pagehide leave one animation owner and no living worker',async({page})=>{
  await page.addInitScript(()=>{
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Set()
    window.__rafProbe={max:0,pending:0}
    window.requestAnimationFrame=callback=>{
      const id=request(now=>{pending.delete(id);window.__rafProbe.pending=pending.size;callback(now)})
      pending.add(id);window.__rafProbe.max=Math.max(window.__rafProbe.max,pending.size);window.__rafProbe.pending=pending.size;return id
    }
    window.cancelAnimationFrame=id=>{pending.delete(id);window.__rafProbe.pending=pending.size;cancel(id)}
  })
  await ready(page);await start(page)
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Pause game'}).click()
    await page.getByRole('button',{name:'Start a fresh climb'}).click()
    await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  }
  expect(await page.evaluate(()=>window.__rafProbe.max)).toBe(1)
  expect(page.workers()).toHaveLength(1)
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect.poll(()=>page.workers().length).toBe(0)
  expect(await page.evaluate(()=>window.__rafProbe.pending)).toBe(0)
})

test('an unresponsive Worker shows a recoverable error instead of hanging forever',async({page})=>{
  test.setTimeout(25000)
  await page.route('**/play/sim-worker.js*',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage = () => {}'}))
  await page.goto('/play/index.html')
  await expect(page.locator('#errorPanel')).toBeVisible({timeout:15000})
  await expect(page.getByRole('button',{name:'Reload the garden'})).toBeEnabled()
  await page.unroute('**/play/sim-worker.js*')
  await page.getByRole('button',{name:'Reload the garden'}).click()
  await expect(page.locator('body')).toHaveAttribute('data-phase','ready')
})

test.describe('mobile arcade',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true})
  test('touch jump, Retina canvas and scroll containment work in a mobile viewport',async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await ready(page)
    await page.screenshot({path:`test-results/arcade-mobile-${test.info().project.name}.png`})
    const dimensions=await page.locator('#gameCanvas').evaluate(canvas=>({
      width:canvas.width,height:canvas.height,css:canvas.getBoundingClientRect().toJSON(),dpr:Number(document.getElementById('gameStage').dataset.dpr),deviceDpr:devicePixelRatio,
    }))
    expect(dimensions.deviceDpr).toBe(2)
    expect(dimensions.width).toBe(Math.round(dimensions.css.width*dimensions.dpr))
    expect(dimensions.height).toBe(Math.round(dimensions.css.height*dimensions.dpr))
    await expect(page.locator('#gameCanvas')).toHaveCSS('touch-action','none')
    await start(page)
    await page.getByRole('button',{name:'Jump',exact:true}).tap()
    await expect.poll(async()=>Number(await page.locator('#score').textContent())).toBeGreaterThan(0)
    await page.mouse.wheel(0,700)
    expect(await page.evaluate(()=>scrollY)).toBe(0)
    const button=await page.getByRole('button',{name:'Jump',exact:true}).boundingBox()
    expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44)
    expect(errors).toEqual([])
  })
  test('disabled persistence cannot break a full round or restart',async({page})=>{
    await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}}))
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await ready(page);await start(page);await scoreAndFall(page)
    await expect(page.locator('#storageNote')).toBeVisible()
    await page.getByRole('button',{name:'One more climb'}).click()
    await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
    await expect(page.locator('#score')).toHaveText('00000')
    expect(errors).toEqual([])
  })
})
