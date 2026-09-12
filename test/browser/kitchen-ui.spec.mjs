import { expect, test } from '@playwright/test'
import { KITCHEN_LEVEL } from '../../dist/sim/level.js'
import { kitchenWitnessInputs, kitchenSteamInputs } from '../support/kitchen-inputs.mjs'
import { observeWorkerTransport } from '../support/worker-observer.mjs'

async function ready(page) {
  await page.goto('/play/kitchen.html')
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'ready')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-level', KITCHEN_LEVEL.id)
  await expect(page.locator('#gameStage')).toHaveAttribute('data-level-hash', KITCHEN_LEVEL.hash)
}

test('Kitchen screen preserves canonical identity, 3D steering, tick-driven cabinet and restart', async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await ready(page)
  await expect(page.getByRole('link',{name:/Kitchen Escape/})).toHaveAttribute('aria-current','page')
  await page.locator('#startButton').click()
  await expect(page.locator('#gameStage')).toHaveAttribute('data-grounded','true')
  const beforeAssistiveX=Number(await page.locator('#gameStage').getAttribute('data-x'))
  await page.locator('[data-game-action="right"]').dispatchEvent('click',{detail:0})
  await expect.poll(async()=>Number(await page.locator('#gameStage').getAttribute('data-x'))).toBeGreaterThan(beforeAssistiveX)
  const initialCabinet=Number(await page.locator('#gameStage').getAttribute('data-cabinet-y'))
  await page.keyboard.down('ArrowUp')
  await expect.poll(async()=>Number(await page.locator('#gameStage').getAttribute('data-z'))).toBeLessThan(-4.03)
  await page.keyboard.up('ArrowUp')
  await expect.poll(async()=>Math.abs(Number(await page.locator('#gameStage').getAttribute('data-cabinet-y'))-initialCabinet)).toBeGreaterThan(.05)
  await page.getByRole('button',{name:'View the kitchen'}).click()
  await expect(page.locator('#overviewButton')).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'Pause game'}).click()
  await expect(page.locator('#pauseDialog')).toBeVisible()
  const cabinet=await page.locator('#gameStage').getAttribute('data-cabinet-y')
  await page.waitForTimeout(250)
  await expect(page.locator('#gameStage')).toHaveAttribute('data-cabinet-y',cabinet)
  await page.locator('#pauseRestartButton').click()
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-last-launch-tick','-1')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-completion-tick','')
  await expect(page.locator('#score')).toHaveText('00000')
  expect(errors).toEqual([])
})

async function startScriptedKitchen(page) {
  await page.addInitScript(observeWorkerTransport)
  const epoch=new Date('2026-09-10T12:00:00Z')
  await page.clock.install({time:epoch})
  await page.clock.pauseAt(new Date(epoch.getTime()+1000))
  await ready(page)
  await page.clock.runFor(16)
  await page.locator('#startButton').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
}

async function driveKeyboard(page, inputs) {
  let right=false,space=false
  for(let tick=0;tick<inputs.length;tick++){
    const input=inputs[tick],nextRight=input.moveX===1
    if(nextRight!==right){await page.keyboard[nextRight?'down':'up']('ArrowRight');right=nextRight}
    if(input.jumpDown&&!space){await page.keyboard.down('Space');space=true}
    if(input.jumpUp&&space){await page.keyboard.up('Space');space=false}
    let sampled=false
    for(let frame=0;!sampled&&frame<3;frame++){
      await page.clock.runFor(16)
      sampled=await page.evaluate(async expected=>{
        const count=window.__transportProbe.requested
        if(count<expected)return false
        if(count!==expected)throw new Error(`Expected one sampled input at ${expected}, received ${count}`)
        await window.__waitForTick(expected)
        return true
      },tick+1)
    }
    expect(sampled,`sample at tick ${tick}`).toBe(true)
  }
  if(right)await page.keyboard.up('ArrowRight')
  if(space)await page.keyboard.up('Space')
}

test('real keyboard input traverses the toaster and authoritative Kitchen Finish, then restarts', async ({ page }) => {
  test.setTimeout(180000)
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await startScriptedKitchen(page)
  const inputs=kitchenWitnessInputs(true)
  await driveKeyboard(page,inputs.slice(0,1167))
  await page.clock.runFor(250)
  const evidence=await page.evaluate(()=>window.__transportProbe)
  expect(evidence.inputs).toEqual(inputs.slice(0,1167))
  expect(evidence.steam).toBe(false);expect(evidence.launch).toBe(true);expect(evidence.finish).toBe(1167)
  await expect(page.locator('body')).toHaveAttribute('data-phase','over')
  await expect(page.locator('#endLabel')).toHaveText('KITCHEN ESCAPED')
  await expect(page.getByRole('dialog',{name:'Sunny-side out.'})).toBeVisible()
  await expect(page.locator('#gameStage')).toHaveAttribute('data-completion-tick','1167')
  await expect.poll(async()=>Number(await page.locator('#gameStage').getAttribute('data-last-launch-tick'))).toBeGreaterThan(0)
  await expect(page.locator('#routePercent')).toHaveText('100%')
  await page.screenshot({path:`test-results/kitchen-finish-${test.info().project.name}.png`})
  await page.locator('#playAgainButton').focus();await page.keyboard.press('Enter')
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  await expect(page.locator('#score')).toHaveText('00000')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-last-launch-tick','-1')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-completion-tick','')
  expect(errors).toEqual([])
})

test('a lower real-keyboard route activates the visible steam lift and resets its cues',async({page})=>{
  test.setTimeout(180000)
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await startScriptedKitchen(page)
  const inputs=kitchenSteamInputs()
  await driveKeyboard(page,inputs)
  await page.keyboard.press('Escape')
  await expect(page.locator('#pauseDialog')).toBeVisible()
  const evidence=await page.evaluate(()=>window.__transportProbe)
  expect(evidence.inputs).toEqual(inputs)
  expect(evidence.steam).toBe(true);expect(evidence.launch).toBe(true);expect(evidence.finish).toBe(null)
  await expect(page.locator('#steamStatus')).toHaveText('LIFTING')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-steam-active','true')
  await expect(page.locator('#steamReadout')).toHaveClass(/active/)
  await page.locator('#pauseRestartButton').focus();await page.keyboard.press('Enter')
  await expect(page.locator('body')).toHaveAttribute('data-phase','playing')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-steam-active','false')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-last-launch-tick','-1')
  expect(errors).toEqual([])
})

test('world navigation keeps separate best scores and tears down the previous worker', async ({ page }) => {
  await page.addInitScript(()=>{
    localStorage.setItem('egg-climb-arcade-best-v1','450')
    localStorage.setItem('egg-climb-kitchen-best-v1','230')
  })
  await page.goto('/play/index.html')
  await expect(page.locator('body')).toHaveAttribute('data-phase','ready')
  await expect(page.locator('#bestScore')).toHaveText('00450')
  await expect.poll(()=>page.workers().length).toBe(1)
  let gardenClosed=false
  page.workers()[0].once('close',()=>{gardenClosed=true})
  await page.getByRole('link',{name:/Kitchen Escape/}).click()
  await expect(page.locator('body')).toHaveAttribute('data-phase','ready')
  await expect(page.locator('#bestScore')).toHaveText('00230')
  await expect.poll(()=>gardenClosed).toBe(true)
  await expect.poll(()=>page.workers().length).toBe(1)
  expect(page.workers()[0].url()).toContain('/play/kitchen-worker.js')
  let kitchenClosed=false
  page.workers()[0].once('close',()=>{kitchenClosed=true})

  let releaseWorker
  const workerGate=new Promise(resolve=>{releaseWorker=resolve})
  await page.route('**/play/sim-worker.js*',async route=>{await workerGate;await route.continue()})
  const navigation=page.getByRole('link',{name:/Cloud Garden/}).click()
  try{
    await expect(page.locator('body')).toHaveAttribute('data-mode','garden')
    await expect(page.locator('#bestScore')).toHaveText('00450')
    await expect(page.locator('body')).toHaveAttribute('data-phase','loading')
    await expect(page.locator('#startButton')).toBeDisabled()
  }finally{
    releaseWorker()
    await navigation
  }
  await expect(page.locator('body')).toHaveAttribute('data-phase','ready')
  await expect(page.locator('#startButton')).toBeEnabled()
  await expect.poll(()=>kitchenClosed).toBe(true)
  await expect.poll(()=>page.workers().length).toBe(1)
  expect(page.workers()[0].url()).toContain('/play/sim-worker.js')
})

test.describe('Kitchen mobile',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true})
  test('four-direction touch controls, orientation and reduced motion preserve mechanical movement',async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'})
    await ready(page)
    await page.screenshot({path:`test-results/kitchen-mobile-${test.info().project.name}.png`})
    for(const action of ['left','right','forward','backward','jump']){
      const control=page.locator(`[data-game-action="${action}"]`),box=await control.boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44)
      await expect(control).toHaveCSS('touch-action','none')
    }
    await page.locator('#startButton').click()
    await expect(page.locator('#gameStage')).toHaveAttribute('data-grounded','true')
    const before=Number(await page.locator('#gameStage').getAttribute('data-cabinet-y'))
    await page.getByRole('button',{name:'Jump',exact:true}).tap()
    await expect.poll(async()=>Number(await page.locator('#score').textContent())).toBeGreaterThan(0)
    await expect.poll(async()=>Math.abs(Number(await page.locator('#gameStage').getAttribute('data-cabinet-y'))-before)).toBeGreaterThan(.05)
    await expect(page.locator('#gameStage')).toHaveAttribute('data-particles','0')
    await page.setViewportSize({width:844,height:390})
    for(const control of await page.locator('[data-game-action]').all()){
      const box=await control.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await page.setViewportSize({width:390,height:844})
    expect(await page.evaluate(()=>scrollX===0&&scrollY===0)).toBe(true)
    const dimensions=await page.locator('#gameCanvas').evaluate(canvas=>({width:canvas.width,css:canvas.getBoundingClientRect().width,dpr:Number(document.getElementById('gameStage').dataset.dpr)}))
    expect(dimensions.width).toBe(Math.round(dimensions.css*dimensions.dpr))
  })
})
