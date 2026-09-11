import { KitchenView } from './kitchen-view.js'
import {
  dampKitchenScalar,
  exponentialDampingAlpha,
  kitchenCameraRegionForX,
  kitchenRouteCueForX,
} from '../dist/render/kitchen-route-presentation.js'

/**
 * Presentation-only wrapper around the existing canonical Kitchen renderer.
 * It does not change simulation snapshots, collisions, replay evidence or score.
 */
export class KitchenReadabilityView extends KitchenView {
  constructor(canvas) {
    super(canvas)
    const region = kitchenCameraRegionForX(this.preview.position.x)
    this.routeCamera = { leadX: 0, liftY: 0, zoom: 1, regionId: region.id }
    this.routeCue = kitchenRouteCueForX(this.preview.position.x)
    this.updatePresentationProbe()
  }

  reset(snapshot) {
    super.reset(snapshot)
    const x = snapshot?.position.x ?? this.preview.position.x
    const region = kitchenCameraRegionForX(x)
    this.routeCamera = { leadX: 0, liftY: 0, zoom: 1, regionId: region.id }
    this.routeCue = kitchenRouteCueForX(x)
    this.updatePresentationProbe()
  }

  followScale() {
    const base = super.followScale()
    return base * (this.overview ? 1 : (this.routeCamera?.zoom ?? 1))
  }

  px(x, z) {
    const leadX = this.overview ? 0 : (this.routeCamera?.leadX ?? 0)
    return this.width * .45 + ((x - (this.camera.x + leadX)) - (z - this.camera.z) * .24) * this.camera.scale
  }

  py(y, z) {
    const liftY = this.overview ? 0 : (this.routeCamera?.liftY ?? 0)
    return this.height * .55 + (-(y - (this.camera.y + liftY)) + (z - this.camera.z) * .22) * this.camera.scale
  }

  render(dt, previous, current, alpha, phase) {
    const x = current?.position.x ?? this.preview.position.x
    const region = kitchenCameraRegionForX(x)
    const cue = kitchenRouteCueForX(x)
    const step = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0))
    const response = exponentialDampingAlpha(step, region.responseSeconds)

    if (this.overview || phase === 'ready' || phase === 'loading') {
      this.routeCamera.leadX = dampKitchenScalar(this.routeCamera.leadX, 0, response)
      this.routeCamera.liftY = dampKitchenScalar(this.routeCamera.liftY, 0, response)
      this.routeCamera.zoom = dampKitchenScalar(this.routeCamera.zoom, 1, response)
    } else {
      this.routeCamera.leadX = dampKitchenScalar(this.routeCamera.leadX, region.leadX, response)
      this.routeCamera.liftY = dampKitchenScalar(this.routeCamera.liftY, region.liftY, response)
      this.routeCamera.zoom = dampKitchenScalar(this.routeCamera.zoom, region.zoom, response)
    }
    this.routeCamera.regionId = region.id
    this.routeCue = cue

    super.render(dt, previous, current, alpha, phase)
    if (phase === 'playing' && !this.overview) this.drawRouteCue()
    this.updatePresentationProbe()
  }

  drawRouteCue() {
    const c = this.ctx
    const label = this.routeCue.label
    const y = Math.max(36, this.height - 43)
    const fontSize = this.width < 360 ? 7.5 : 8.5
    c.save()
    c.font = `700 ${fontSize}px 'Trebuchet MS', sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.letterSpacing = '.08em'
    const width = Math.min(this.width - 36, c.measureText(label).width + 24)
    c.fillStyle = '#fff8e7dc'
    c.strokeStyle = '#b9c2a6cc'
    c.lineWidth = .8
    c.beginPath()
    c.roundRect(this.width / 2 - width / 2, y - 10, width, 20, 7)
    c.fill()
    c.stroke()
    c.fillStyle = '#36574c'
    c.fillText(label, this.width / 2, y + .5)
    c.restore()
  }

  updatePresentationProbe() {
    if (!this.canvas) return
    this.canvas.dataset.cameraRegion = this.routeCamera?.regionId ?? 'table-counter'
    this.canvas.dataset.routeCue = this.routeCue?.label ?? 'NEXT · TOASTER POP'
  }

  get telemetry() {
    return {
      ...super.telemetry,
      cameraRegion: this.routeCamera?.regionId ?? 'table-counter',
      routeCue: this.routeCue?.label ?? 'NEXT · TOASTER POP',
    }
  }
}
