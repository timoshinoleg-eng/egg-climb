import { defaultReplayHeader, runReplay } from '../dist/sim/index.js'

const GOLDEN_REPLAY_FINGERPRINT = '2f2e18b0'
const replay = {
  header: defaultReplayHeader(),
  inputEvents: [
    { tick: 10, seq: 0, kind: 'move', moveX: 1, moveZ: 0 },
    { tick: 90, seq: 0, kind: 'move', moveX: 0, moveZ: 0.5 },
    { tick: 150, seq: 0, kind: 'move', moveX: 0, moveZ: 0 },
    { tick: 170, seq: 0, kind: 'jump', down: true },
    { tick: 175, seq: 0, kind: 'jump', down: false },
  ],
  finishTick: 240,
  clientFingerprint: GOLDEN_REPLAY_FINGERPRINT,
}

const result = await runReplay(replay)
const output = document.querySelector('#result')
output.textContent = result.fingerprint
output.dataset.clientMatch = String(result.clientFingerprintMatches)
output.dataset.userAgent = navigator.userAgent
window.__EGG_REPLAY_RESULT__ = result
