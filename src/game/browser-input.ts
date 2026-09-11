import type { InputAction, InputState } from './input-state.js'

const KEY_ACTIONS: Readonly<Record<string, InputAction>> = Object.freeze({
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'forward', KeyW: 'forward', ArrowDown: 'backward', KeyS: 'backward', Space: 'jump',
})

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]'))
}

export interface BrowserInputOptions {
  readonly active: () => boolean
  readonly onCancel?: () => void
  readonly root?: ParentNode
}

/** All listeners have one abortable lifetime; lost capture never releases another finger. */
export function bindGameInput(input: InputState, options: BrowserInputOptions): () => void {
  const controller = new AbortController()
  const signal = controller.signal
  const cancel = () => { input.cancel(); options.onCancel?.() }
  window.addEventListener('keydown', event => {
    const action = KEY_ACTIONS[event.code]
    if (!action || !options.active() || isInteractiveTarget(event.target)) return
    event.preventDefault()
    if (!event.repeat) input.press(action, `key:${event.code}`)
  }, { signal })
  window.addEventListener('keyup', event => {
    if (!KEY_ACTIONS[event.code]) return
    if (options.active() && !isInteractiveTarget(event.target)) event.preventDefault()
    input.release(`key:${event.code}`)
  }, { signal })
  window.addEventListener('blur', cancel, { signal })
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel() }, { signal })
  const end = (event: PointerEvent, cancelled: boolean) => input.release(`pointer:${event.pointerId}`, cancelled)
  window.addEventListener('pointerup', event => end(event, false), { signal })
  window.addEventListener('pointercancel', event => end(event, true), { signal })
  for (const button of (options.root ?? document).querySelectorAll<HTMLElement>('[data-game-action]')) {
    const action = button.dataset.gameAction as InputAction
    if (!['left', 'right', 'forward', 'backward', 'jump'].includes(action)) continue
    button.addEventListener('pointerdown', event => {
      if (!options.active() || (event.pointerType === 'mouse' && event.button !== 0)) return
      event.preventDefault()
      input.press(action, `pointer:${event.pointerId}`)
      try { button.setPointerCapture(event.pointerId) } catch { /* Window release is the fallback. */ }
    }, { signal })
    button.addEventListener('pointerup', event => end(event, false), { signal })
    button.addEventListener('pointercancel', event => end(event, true), { signal })
    button.addEventListener('lostpointercapture', event => end(event, true), { signal })
    button.addEventListener('click', event => {
      // Keyboard / assistive activation has no pointerdown/up pair.
      if (event.detail === 0 && options.active()) {
        const owner = `activation:${action}`
        input.press(action, owner)
        input.release(owner)
      }
    }, { signal })
    button.addEventListener('contextmenu', event => event.preventDefault(), { signal })
  }
  return () => { controller.abort(); input.reset() }
}
