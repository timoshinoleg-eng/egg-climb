import { KitchenReadabilityView } from './kitchen-readability-view.js'

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
 * The authoritative Kitchen simulation remains unchanged. This renderer only
 * reduces Canvas 2D work: DPR is locked to LOW, static faces use flat fills
 * instead of affine texture draws, and the decorative room is simplified.
 */
export class KitchenMaxView extends KitchenReadabilityView {
  constructor(canvas) {
    super(canvas)
    super.setQuality('low')
  }

  setQuality() {
    // Keep MAX on the stable DPR=1 path. The generic adaptive-quality loop may
    // request upgrades after short fast windows; those upgrades are intentionally
    // ignored in this constrained WebView profile.
    super.setQuality('low')
  }

  drawFace(face) {
    if (this.quality !== 'low') return super.drawFace(face)
    const c = this.ctx, p = face.points
    const palette = FACE_COLORS[face.box.definition.id] ?? { top: '#d8d8c8', front: '#aeb8aa', side: '#909d91' }
    c.fillStyle = palette[face.material] ?? palette.front
    c.strokeStyle = face.material === 'top' ? '#637e6055' : '#4b65594a'
    c.lineWidth = .8
    c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 1; i < 4; i++) c.lineTo(p[i * 2], p[i * 2 + 1]); c.closePath(); c.fill(); c.stroke()
  }

  drawRoom() {
    if (this.quality !== 'low') return super.drawRoom()
    const c = this.ctx
    c.fillStyle = this.sky; c.fillRect(0, 0, this.width, this.height)

    // Two flat planes retain the cutaway-kitchen read without per-frame pattern
    // sampling or dozens of decorative draw calls.
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

    // Preserve only the strongest scale/readability anchors.
    this.wallRect(23, 7.1, 6.2, 3.9, -9.95, '#9eb6aa')
    this.wallRect(23.18, 7.3, 5.84, 3.52, -9.94, '#c9dfcf')
    this.wallRect(25.98, 7.25, .15, 3.6, -9.9, '#fff4d4')
    this.wallRect(23.1, 9.02, 6, .14, -9.9, '#fff4d4')

    const lift = this.scene.boxes.find(box => box.definition.id === 'moving-cabinet')?.definition
    if (lift) {
      for (const x of [lift.center[0] - lift.halfExtents[0] + .12, lift.center[0] + lift.halfExtents[0] - .12]) {
        this.worldLine(x, lift.center[1] - .65, -8.8, x, lift.center[1] + lift.motion.distance + .65, -8.8, '#64816c88', 2)
      }
    }
  }
}
