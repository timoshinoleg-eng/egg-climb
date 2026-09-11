import { ArcadeRun } from '../dist/game/arcade-run.js'
import { ARCADE_PHYSICS, ARCADE_FEEL } from '../dist/game/arcade-level.js'
import { KitchenRun, KITCHEN_OPTIONS, KITCHEN_BEST_SCORE_KEY } from '../dist/game/kitchen-run.js'
import { FOUNDATION_LEVEL } from '../dist/sim/level.js'
import { BEST_SCORE_KEY } from '../dist/game/storage.js'

function isMaxLaunch() {
  const params = new URLSearchParams(location.search)
  return params.get('max') === '1' || params.has('WebAppStartParam') || location.hash.includes('WebAppData=')
}

const GARDEN = Object.freeze({
  id: 'garden', Run: ArcadeRun, worker: './sim-worker.js', planar: true,
  preset: ARCADE_PHYSICS, feel: ARCADE_FEEL, level: FOUNDATION_LEVEL, bestKey: BEST_SCORE_KEY,
  loadView: async () => (await import('./garden-view.js')).GardenView,
  startLabel: "Let's climb", running: 'ONE LITTLE LEAP AT A TIME', reset: 'BACK TO THE NEST',
  winReason: 'summit', winLabel: 'GARDEN COMPLETE', winTitle: 'Look how far you grew.',
  winCopy: 'A little courage goes a long way.',
})
const KITCHEN = Object.freeze({
  id: 'kitchen', Run: KitchenRun, worker: './kitchen-worker.js', planar: false,
  ...KITCHEN_OPTIONS, bestKey: KITCHEN_BEST_SCORE_KEY,
  loadView: async () => isMaxLaunch()
    ? (await import('./kitchen-max-view.js')).KitchenMaxView
    : (await import('./kitchen-readability-view.js')).KitchenReadabilityView,
  startLabel: "Let's escape", running: 'A LITTLE BREAK FOR FREEDOM', reset: 'BACK TO THE TABLE',
  winReason: 'finish', winLabel: 'KITCHEN ESCAPED', winTitle: 'Sunny-side out.',
  winCopy: 'You found the vent. A little courage goes a long way.',
})

/** Static page-selected profiles, never arbitrary physics/fixture data from a query. */
export function gameMode(id) { return id === 'kitchen' ? KITCHEN : GARDEN }
