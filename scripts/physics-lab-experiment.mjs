import { createSimulation, PHYSICS_V1, PHYSICS_LAB_PRESETS, physicsLabScenario } from '../dist/sim/index.js'
const neutral = { moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false }
const upY = s => 1 - 2 * (s.rotation.x * s.rotation.x + s.rotation.z * s.rotation.z)
export async function measureTilt(preset, tip = false) {
  const scenario = physicsLabScenario('broad-base-rest')
  const sim = await createSimulation({ preset, level: scenario.level, initialEgg: { ...scenario.initialEgg,
    position: [0, tip ? 0.82 : 0.64, 0], rotation: tip ? [0,0,0.9990482216,-0.0436193874] : [0,0,0.0436193874,0.9990482216] } })
  try {
    let peakAngular = 0
    for (let t = 0; t < 180; t++) { sim.step(neutral); const s = sim.snapshot(); peakAngular = Math.max(peakAngular, Math.hypot(...Object.values(s.angularVelocity))) }
    return { upY: upY(sim.snapshot()), peakAngular }
  } finally { sim.free() }
}
export async function measureJump(preset, id) {
  const scene = physicsLabScenario(id)
  const sim = await createSimulation({ preset, level: scene.level, initialEgg: scene.initialEgg })
  try {
    let before
    for (let t = 0; t < 180; t++) { sim.step(neutral); before = sim.snapshot(); if (before.physics.grounded) break }
    if (!before.physics.grounded) throw new Error(`No support: ${id}`)
    sim.step({ ...neutral, jumpDown: true })
    let apex = before.position.y, lateral = 0, landingTick = null, recoveryTick = null, airborne = false, stableTicks = 0
    for (let t = 0; t < 240; t++) {
      const s = sim.snapshot()
      apex = Math.max(apex, s.position.y)
      lateral = Math.max(lateral, Math.abs(s.position.x - before.position.x))
      if (!s.physics.grounded) airborne = true
      if (airborne && s.physics.grounded && landingTick === null) landingTick = t
      const stable = landingTick !== null && s.physics.grounded && Math.hypot(...Object.values(s.linearVelocity)) < 0.15 && Math.hypot(...Object.values(s.angularVelocity)) < 0.2
      stableTicks = stable ? stableTicks + 1 : 0
      if (stableTicks === 15 && recoveryTick === null) recoveryTick = t - landingTick
      sim.step(neutral)
    }
    return { contactT: before.physics.contactT, rise: apex - before.position.y, lateral, landingTick, recoveryTick }
  } finally { sim.free() }
}
export async function measureControl(preset, moveX) {
  const scene = physicsLabScenario('broad-base-rest')
  const sim = await createSimulation({ preset, level: scene.level, initialEgg: scene.initialEgg })
  try { for (let t = 0; t < 90; t++) sim.step({ ...neutral, moveX }); return sim.snapshot().position.x } finally { sim.free() }
}
export async function experimentMatrix() {
  const rows = []
  for (const preset of Object.values(PHYSICS_LAB_PRESETS)) rows.push({ id: preset.id, curve: preset.jump.curve,
    base: await measureJump(preset, 'jump-base'), side: await measureJump(preset, 'jump-side'), tip: await measureJump(preset, 'jump-tip'),
    slope: await measureJump(preset, 'slope-contact'), baseStability: await measureTilt(preset), tipStability: await measureTilt(preset, true),
    controlLeft: await measureControl(preset, -1), controlRight: await measureControl(preset, 1) })
  const com = []
  for (const centerOfMassY of [-0.08,-0.12,-0.16,0]) com.push({ centerOfMassY, ...await measureTilt({ ...PHYSICS_V1, egg: { ...PHYSICS_V1.egg, centerOfMassY } }) })
  const directions = []
  for (const normal of [0,0.1,0.15,0.2,1]) directions.push({ normal, ...await measureJump({ ...PHYSICS_V1, jump: { ...PHYSICS_V1.jump, worldUpWeight: 1-normal, contactNormalWeight: normal } }, 'slope-contact') })
  return { rows, com, directions }
}
