// Shared, pre-rendered original egg artwork. No physics or animation state.
const TAU = Math.PI * 2
export const sprite = document.createElement('canvas')
sprite.width = 256; sprite.height = 320
const eggInk = sprite.getContext('2d')
if (eggInk) {
  eggInk.translate(128, 192); eggInk.scale(200, 200)
  const gradient = eggInk.createLinearGradient(-0.35, -0.5, 0.4, 0.5)
  gradient.addColorStop(0, '#fffef1'); gradient.addColorStop(0.5, '#fff5d7'); gradient.addColorStop(1, '#e6c990')
  eggInk.beginPath(); eggInk.moveTo(0, -0.75)
  eggInk.bezierCurveTo(0.22, -0.77, 0.48, -0.22, 0.48, 0.06)
  eggInk.bezierCurveTo(0.49, 0.34, 0.29, 0.49, 0, 0.49)
  eggInk.bezierCurveTo(-0.29, 0.49, -0.49, 0.34, -0.48, 0.06)
  eggInk.bezierCurveTo(-0.48, -0.22, -0.22, -0.77, 0, -0.75)
  eggInk.closePath(); eggInk.fillStyle = gradient; eggInk.fill()
  eggInk.strokeStyle = '#56704b'; eggInk.lineWidth = 0.018; eggInk.stroke()
  eggInk.beginPath(); eggInk.moveTo(-0.13, -0.55); eggInk.bezierCurveTo(-0.25, -0.43, -0.32, -0.29, -0.34, -0.16)
  eggInk.strokeStyle = '#ffffffcc'; eggInk.lineWidth = 0.055; eggInk.lineCap = 'round'; eggInk.stroke()
  eggInk.fillStyle = '#bd8e5655'
  for (const [x, y, r] of [[0.17,-0.49,0.013],[0.24,-0.32,0.011],[-0.08,-0.42,0.008],[0.31,0.27,0.013],[-0.27,0.3,0.013],[0.21,0.37,0.007]]) {
    eggInk.beginPath(); eggInk.arc(x,y,r,0,TAU); eggInk.fill()
  }
  eggInk.fillStyle = '#e5a17b80'
  for (const x of [-0.24,0.24]) { eggInk.beginPath(); eggInk.ellipse(x,0.135,0.065,0.032,0,0,TAU); eggInk.fill() }
}
