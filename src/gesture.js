// src/gesture.js
// Runs in the overlay renderer process.
// Bridges MediaPipe results → interpreter → injector on every frame.

const { interpret, reset } = require('./interpreter')
const { inject }           = require('./injector')

let lastGestureName = null
let lastFiredTime   = null

// Minimum ms between firing the same gesture repeatedly.
// Prevents a held pinch from clicking 30 times per second.
const REPEAT_COOLDOWN = 400

/**
 * Called once per MediaPipe frame with the raw landmark result.
 * Runs the full interpret → inject pipeline.
 *
 * @param {object|null} landmarks - 21 MediaPipe landmarks or null if no hand
 * @param {string|null} rawGesture - gesture name from camera.worker.js
 */
async function processFrame(landmarks, rawGesture) {

  // No hand in frame — reset interpreter state so stale
  // velocity doesn't bleed into the next detection
  if (!landmarks || !rawGesture) {
    reset()
    lastGestureName = null
    return
  }

  // Run the stateful interpreter to get enriched gesture + screen position
  const position = landmarks[8]  // index fingertip as primary position anchor
  const event    = interpret(rawGesture, position)

  if (!event) return

  const now        = Date.now()
  const isSame     = event.gesture === lastGestureName
  const isCooledDown = !lastFiredTime || (now - lastFiredTime) > REPEAT_COOLDOWN

  // Always fire movement events — cursor tracking needs every frame
  const isMovement = event.gesture === 'point_move'

  if (isMovement || !isSame || isCooledDown) {
    lastGestureName = event.gesture
    lastFiredTime   = now

    // Fire the OS input event
    console.log('firing gesture:', event.gesture, event.position)
    await inject(event)

    // Send gesture name to main so the HUD label updates
    window.gestureAPI.onGesture({ gesture: event.gesture })
  }
}

module.exports = { processFrame }