import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KITCHEN_CAMERA_REGIONS,
  KITCHEN_ROUTE_CUES,
  dampKitchenScalar,
  exponentialDampingAlpha,
  kitchenCameraRegionForX,
  kitchenRouteCueForX,
} from '../dist/render/kitchen-route-presentation.js'

test('Kitchen camera regions advance monotonically toward the vent', () => {
  assert.deepEqual(KITCHEN_CAMERA_REGIONS.map(region => region.id), [
    'table-counter', 'toaster-steam', 'fridge-cabinet', 'hood-vent',
  ])
  assert.equal(kitchenCameraRegionForX(10).id, 'table-counter')
  assert.equal(kitchenCameraRegionForX(16.5).id, 'toaster-steam')
  assert.equal(kitchenCameraRegionForX(20.2).id, 'fridge-cabinet')
  assert.equal(kitchenCameraRegionForX(23.7).id, 'hood-vent')
  assert.equal(kitchenCameraRegionForX(Number.NaN).id, 'table-counter')
  for (let i = 1; i < KITCHEN_CAMERA_REGIONS.length; i += 1) {
    assert.ok(KITCHEN_CAMERA_REGIONS[i].minX > KITCHEN_CAMERA_REGIONS[i - 1].minX)
    assert.ok(KITCHEN_CAMERA_REGIONS[i].zoom <= KITCHEN_CAMERA_REGIONS[i - 1].zoom)
  }
})

test('Kitchen route cues expose one clear next objective on mobile and desktop', () => {
  assert.deepEqual(KITCHEN_ROUTE_CUES.map(cue => cue.id), ['toaster', 'steam', 'cabinet', 'vent', 'freedom'])
  assert.equal(kitchenRouteCueForX(10).label, 'NEXT · TOASTER POP')
  assert.equal(kitchenRouteCueForX(17.55).label, 'NEXT · STEAM LIFT')
  assert.equal(kitchenRouteCueForX(19.35).label, 'NEXT · MOVING CABINET')
  assert.equal(kitchenRouteCueForX(22.75).label, 'NEXT · OPEN VENT')
  assert.equal(kitchenRouteCueForX(26.15).label, 'VENT · FREEDOM')
  assert.equal(kitchenRouteCueForX(Number.NaN).id, 'toaster')
})

test('camera damping is frame-rate independent over equal elapsed time', () => {
  function integrate(fps) {
    let current = 0
    const dt = 1 / fps
    for (let i = 0; i < fps; i += 1) {
      current = dampKitchenScalar(current, 1, exponentialDampingAlpha(dt, 0.24))
    }
    return current
  }
  const at30 = integrate(30)
  const at60 = integrate(60)
  const at120 = integrate(120)
  assert.ok(Math.abs(at30 - at60) < 1e-12)
  assert.ok(Math.abs(at60 - at120) < 1e-12)
})

test('presentation damping fails soft on invalid timing values', () => {
  assert.equal(exponentialDampingAlpha(Number.NaN, 0.24), 0)
  assert.equal(exponentialDampingAlpha(1 / 60, 0), 1)
  assert.equal(dampKitchenScalar(3, 9, Number.NaN), 3)
  assert.equal(dampKitchenScalar(Number.NaN, 9, 1), 9)
})
