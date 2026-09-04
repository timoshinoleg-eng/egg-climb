import { useEffect, useRef, useState } from 'react'
import { useInput } from './useInput'

const STICK_RADIUS = 54

export function TouchControls() {
  const stickRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const setMove = useInput((state) => state.setMove)
  const resetMove = useInput((state) => state.resetMove)
  const triggerJump = useInput((state) => state.triggerJump)

  useEffect(() => {
    const pressed = new Set<string>()
    const syncKeyboard = () => {
      const x = (pressed.has('ArrowRight') || pressed.has('KeyD') ? 1 : 0) -
        (pressed.has('ArrowLeft') || pressed.has('KeyA') ? 1 : 0)
      const y = (pressed.has('ArrowUp') || pressed.has('KeyW') ? 1 : 0) -
        (pressed.has('ArrowDown') || pressed.has('KeyS') ? 1 : 0)
      setMove(x, y)
    }
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) triggerJump()
        return
      }
      pressed.add(event.code)
      syncKeyboard()
    }
    const up = (event: KeyboardEvent) => {
      pressed.delete(event.code)
      syncKeyboard()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [setMove, triggerJump])

  const updateStick = (clientX: number, clientY: number) => {
    const rect = stickRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const length = Math.hypot(dx, dy) || 1
    const scale = Math.min(1, STICK_RADIUS / length)
    const x = dx * scale
    const y = dy * scale
    setKnob({ x, y })
    setMove(x / STICK_RADIUS, -y / STICK_RADIUS)
  }

  return (
    <div className="touch-layer" aria-label="Game controls">
      <div
        ref={stickRef}
        className="joystick"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          updateStick(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateStick(event.clientX, event.clientY)
          }
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          setKnob({ x: 0, y: 0 })
          resetMove()
        }}
        onPointerCancel={() => {
          setKnob({ x: 0, y: 0 })
          resetMove()
        }}
      >
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        type="button"
        className="jump-button"
        onPointerDown={(event) => {
          event.preventDefault()
          triggerJump()
        }}
      >
        JUMP
      </button>
    </div>
  )
}
