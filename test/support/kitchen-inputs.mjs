import { KITCHEN_WITNESS_INPUT_EVENTS, KITCHEN_WITNESS_FINISH_TICK } from '../fixtures/kitchen-witness.mjs'

/** Expand the unchanged upstream witness; never part of the shipped player. */
export function kitchenWitnessInputs(keyboardOnly = false) {
  let cursor = 0, moveX = 0, moveZ = 0
  const inputs = []
  for (let tick = 0; tick < KITCHEN_WITNESS_FINISH_TICK; tick++) {
    let jumpDown = false, jumpUp = false, jumpCancel = false
    while (cursor < KITCHEN_WITNESS_INPUT_EVENTS.length && KITCHEN_WITNESS_INPUT_EVENTS[cursor].tick === tick) {
      const event = KITCHEN_WITNESS_INPUT_EVENTS[cursor++]
      if (event.kind === 'move') { moveX = event.moveX; moveZ = event.moveZ }
      else if (event.kind === 'jump-cancel') jumpCancel = true
      else if (event.down) jumpDown = true
      else jumpUp = true
    }
    // The final precision segment uses legal D-key pulses, not an analog-input
    // test hook. The original witness and its canonical fingerprint stay intact.
    const x = keyboardOnly && moveX === 0.2 ? Number(tick % 5 === 0) : moveX
    inputs.push({ moveX: x, moveZ, jumpDown, jumpUp, jumpCancel })
  }
  return inputs
}


/** The unchanged witness jumps above steam. This legal variant skips the jump
 * immediately before toaster entry, so its lower arc actually enters steam. */
export function kitchenSteamInputs() {
  const inputs = kitchenWitnessInputs(true).slice(0, 902)
  for (const tick of [873, 874]) inputs[tick] = { ...inputs[tick], jumpDown: false, jumpUp: false }
  return inputs
}
