import { KitchenReadabilityView } from './kitchen-readability-view.js'
import { KITCHEN_LEVEL_DEFINITION as LEVEL } from '../dist/sim/level.js'

const FACE_COLORS = Object.freeze({
  table: { top: '#dfbd82', front: '#ba8d59', side: '#ac7b4c' },
  'cutting-board': { top: '#edcf98', front: '#c9a56b', side: '#b38c55' },
  counter: { top: '#f5f0df', front: '#acc5b5', side: '#87aa99' },
  toaster: { top: '#ebd5b8', front: '#c58161', side: '#a76550' },
  fridge: { top: '#dce6d9', front: '#9db8aa', side: '#76988c' },
  'moving-cabinet': { top: '#dae6c0', front: '#81966f', side: '#647e5e' },
  hood: { top: '#e3e5df', front: '#b9c6bd', side: '#97aba0' },
  vent: { top: '#e9e8d8', front: '#b9cbb9', side: '#94af9c' },
})

/**
 * MAX/WebView-specific presentation profile.
 *
 * The authoritative Kitchen simulation still runs at the normal fixed tick in
 * the Worker. Only presentation is degraded: LOW/DPR=1, every second render
 * callback is skipped, decorative animation is disabled, and surfaces use flat
 * fills. This halves expensive Canvas work even when the WebView is already slow.
 */
export class KitchenMaxView extends KitchenReadabilityView {
  constructor(canvas) {
    super(canvas)
    this.maxRenderParity = 1
    this.maxRenderDebt = 0
    super.setQuality('low')
    super.setReducedMotion(true)
    this.canvas.dataset.maxProfile = 'performance-v2'
    this.canvas.dataset.renderStride = '2'
    this.canvas.dataset.motionLocked = 'true'

    // MAX never uses the textured face path, so release those backing canvases
    // after construction instead of retaining them for the whole run.
    for (const texture of this.materials.values()) { texture.width = 1; texture.height = 1 }
    this.materials.clear()
    this.floor.canvas.width = 1
    this.wall.canvas.width = 1
  }

  setQuality() {
    super.setQuality('low')
  }

  setReducedMotion() {
    // Presentation motion is force-disabled in MAX. Physics and controls are not.
    super.setReducedMotion(true)
  }

  onPhase(phase) {
    super.onPhase(phase)
    if (phase === 'playing') {
      this.maxRenderParity = 1
      this.maxRenderDebt = 0
    }
  }

  accept(frame) {
    // Preserve authoritative presentation events needed for launch/finish cues,
    // but do not spawn score labels or particles in the constrained profile.
    for (const event of frame.events) if (this.pendingEvents.length < 64) this.pendingEvents.push(event)
  }

  render(dt, previous, current, alpha, phase) {
    if (this.disposed) return false
    const step = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0))
    if (phase === 'playing') {
      this.maxRenderDebt = Math.min(.1, this.maxRenderDebt + step)
      this.maxRenderParity = (this.maxRenderParity + 1) & 1
      if (this.maxRenderParity) return false
      const elapsed = this.maxRenderDebt
      this.maxRenderDebt = 0
      return super.render(elapsed, previous, current, alpha, phase)
    }
    this.maxRenderDebt = 0
    return super.render(step, previous, current, alpha, phase)
  }

  drawFace(face) {
    const c = this.ctx, p = face.points
    const palette = FACE_COLORS[face.box.definition.id] ?? { top: '#d8d8c8', front: '#aeb8aa', side: '#909d91' }
    c.fillStyle = palette[face.material] ?? palette.front
    c.strokeStyle = face.material === 'top' ? '#637e6055' : '#4b65594a'
    c.lineWidth = .8
    c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 1; i < 4; i++) c.lineTo(p[i * 2], p[i * 2 + 1]); c.closePath(); c.fill(); c.stroke()
  }

  drawRoom() {
    const c = this.ctx
    c.fillStyle = this.sky; c.fillRect(0, 0, this.width, this.height)

    // Minimal cutaway planes only. The canonical colliders themselves provide
    // the route geometry, so decorative cupboards/window/rails are unnecessary.
    c.fillStyle = '#e6dfc9'
    c.beginPath()
    c.moveTo(this.px(4, -12), this.py(-1.5, -12))
    c.lineTo(this.px(32, -12), this.py(-1.5, -12))
    c.lineTo(this.px(32, 5), this.py(-1.5, 5))
    c.lineTo(this.px(4, 5), this.py(-1.5, 5))
    c.closePath(); c.fill()

    c.fillStyle = '#e9e5d6'
    c.beginPath()
    c.moveTo(this.px(4, -10), this.py(-1.5, -10))
    c.lineTo(this.px(32, -10), this.py(-1.5, -10))
    c.lineTo(this.px(32, -10), this.py(12, -10))
    c.lineTo(this.px(4, -10), this.py(12, -10))
    c.closePath(); c.fill()
  }

  drawSteam() {
    const zone = LEVEL.continuousForceZones[0]
    const [x, y, z] = zone.center, [hx, hy] = zone.halfExtents
    const c = this.ctx
    c.save()
    c.globalAlpha = this.scene.steamActive ? .2 : .08
    c.fillStyle = '#fff8dc'
    c.fillRect(this.px(x - hx, z), this.py(y + hy, z), hx * 2 * this.camera.scale, hy * 2 * this.camera.scale)
    c.restore()
  }

  drawParticles() {}
  tag() {}
}
