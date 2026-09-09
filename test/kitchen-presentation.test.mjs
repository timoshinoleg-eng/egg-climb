import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KITCHEN_SECTION_ORDER,
  dampKitchenVec3,
  exponentialDampingAlpha,
  kitchenCameraRegionForX,
  kitchenCameraTargets,
  kitchenSectionForX,
  kitchenSectionIndex,
} from '../dist/render/kitchen-presentation.js'

test('Kitchen route sections are stable and monotonic along authored X progression', () => {
  assert.deepEqual([...KITCHEN_SECTION_ORDER], [
    'table', 'cutting-board', 'counter', 'toaster', 'steam', 'fridge', 'moving-cabinet', 'hood', 'vent',
  ])
  const samples = [
    [10, 'table'], [12, 'cutting-board'], [14.4, 'counter'], [17, 'toaster'], [18.8, 'steam'],
    [20.2, 'fridge'], [21.8, 'moving-cabinet'], [24, 'hood'], [26.2, 'vent'],
  ]
  let previous = -1
  for (const [x, expected] of samples) {
    const section = kitchenSectionForX(x)
    assert.equal(section, expected)
    const index = kitchenSectionIndex(section)
    assert.ok(index > previous)
    previous = index
  }
  assert.equal(kitchenSectionForX(Number.NaN), 'table')
})

test('camera regions advance toward the vent and keep forward look-ahead', () => {
  assert.equal(kitchenCameraRegionForX(10).id, 'table-counter')
  assert.equal(kitchenCameraRegionForX(17).id, 'toaster-steam')
  assert.equal(kitchenCameraRegionForX(20.4).id, 'fridge-cabinet')
  assert.equal(kitchenCameraRegionForX(24).id, 'hood-vent')
  const egg = { x: 18, y: 4, z: -4 }
  const targets = kitchenCameraTargets(egg)
  assert.equal(targets.region.id, 'toaster-steam')
  assert.ok(targets.lookAt.x > egg.x)
  assert.ok(targets.position.z > egg.z)
  assert.ok(targets.position.y > egg.y)
})

test('exponential camera damping is frame-rate independent over equal elapsed time', () => {
  const target = { x: 10, y: 5, z: -3 }
  function integrate(fps) {
    let current = { x: 0, y: 0, z: 0 }
    const dt = 1 / fps
    for (let i = 0; i < fps; i += 1) {
      current = dampKitchenVec3(current, target, exponentialDampingAlpha(dt, 0.22))
    }
    return current
  }
  const at30 = integrate(30)
  const at60 = integrate(60)
  const at120 = integrate(120)
  for (const key of ['x', 'y', 'z']) {
    assert.ok(Math.abs(at30[key] - at60[key]) < 1e-10, key)
    assert.ok(Math.abs(at60[key] - at120[key]) < 1e-10, key)
  }
})

test('damping helpers fail soft on non-finite presentation inputs', () => {
  assert.equal(exponentialDampingAlpha(Number.NaN, 0.2), 0)
  assert.equal(exponentialDampingAlpha(1 / 60, 0), 1)
  assert.deepEqual(dampKitchenVec3({ x: 1, y: 2, z: 3 }, { x: 9, y: 9, z: 9 }, Number.NaN), { x: 1, y: 2, z: 3 })
})
