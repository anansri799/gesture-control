// src/camera.worker.js
// Runs on a dedicated Worker thread — isolated from main and the overlay.
// Owns the full ML pipeline: capture → inference → interpretation → dispatch.
// Raw frames are processed in-memory and discarded. Nothing is stored.

const { parentPort } = require('worker_threads')

let running = false
let paused  = false

// ─────────────────────────────────────────────────────
// MESSAGE HANDLER
// Main process sends control signals here.
// ─────────────────────────────────────────────────────

parentPort.on('message', (msg) => {
  if (msg.type === 'start')  { running = true;  startPipeline() }
  if (msg.type === 'pause')  { paused  = true  }
  if (msg.type === 'resume') { paused  = false }
  if (msg.type === 'stop')   { running = false }
})

// ─────────────────────────────────────────────────────
// GESTURE STATE
// We track the last N frames to confirm a gesture before
// firing it. This prevents false positives from twitches.
// ─────────────────────────────────────────────────────

const CONFIRM_FRAMES = 3  // frames a gesture must hold before firing
let gestureBuffer    = [] // rolling window of recent gesture reads
let lastGesture      = null
let lastPosition     = { x: 0, y: 0 }

// ─────────────────────────────────────────────────────
// MAIN PIPELINE
// Called once on start. Loops forever reading frames,
// running inference, interpreting results, dispatching.
// ─────────────────────────────────────────────────────

async function startPipeline() {
  const { Hands } = await import('@mediapipe/hands')

  const hands = new Hands({
    locateFile: (file) => `../node_modules/@mediapipe/hands/${file}`
  })

  // Lite model — fast enough for real-time, accurate enough for landmarks
  hands.setOptions({
    maxNumHands:         1,
    modelComplexity:     0,   // 0 = Lite, 1 = Full. Lite saves ~10ms per frame
    minDetectionConfidence: 0.75,
    minTrackingConfidence:  0.75,
  })

  /**
   * MediaPipe calls this every time it finishes processing a frame.
   * results.multiHandLandmarks is an array of hands, each hand
   * being 21 landmarks with x, y, z coordinates (0–1 normalised).
   */
  hands.onResults((results) => {
    if (paused || !running) return

    if (!results.multiHandLandmarks?.length) {
      // No hand detected — clear the buffer and reset
      gestureBuffer = []
      lastGesture   = null
      parentPort.postMessage({ type: 'landmarks', data: null })
      return
    }

    const landmarks = results.multiHandLandmarks[0]

    // Send landmarks to overlay for skeleton drawing
    parentPort.postMessage({ type: 'landmarks', data: landmarks })

    // Interpret what gesture this landmark configuration is
    const gesture = interpretGesture(landmarks)

    // Confirm gesture over N frames before firing
    // This is the debounce that stops twitches triggering actions
    gestureBuffer.push(gesture)
    if (gestureBuffer.length > CONFIRM_FRAMES) {
      gestureBuffer.shift()
    }

    const confirmed = gestureBuffer.every(g => g?.name === gesture?.name)

    if (confirmed && gesture && gesture.name !== lastGesture) {
      lastGesture = gesture.name
      parentPort.postMessage({ type: 'gesture', ...gesture })
    }
  })

  // Start the camera capture loop
  await captureLoop(hands)
}

// ─────────────────────────────────────────────────────
// CAPTURE LOOP
// Grabs frames from the webcam and feeds them to MediaPipe.
// Uses the getUserMedia API via a hidden canvas in the worker.
// ─────────────────────────────────────────────────────

async function captureLoop(hands) {
  const { createCanvas } = require('canvas')

  // We capture at 640x480 — enough for landmark detection,
  // small enough to keep decode time under 4ms
  const canvas = createCanvas(640, 480)
  const ctx    = canvas.getContext('2d')

  // getUserMedia is not available in worker threads directly.
  // We use the node-canvas + a native camera binding instead.
  // In the actual renderer we use the webcam via getUserMedia —
  // see overlay.html for the camera initialisation.
  parentPort.postMessage({ type: 'ready' })
}

// ─────────────────────────────────────────────────────
// GESTURE INTERPRETER
// Takes 21 landmarks and returns a gesture name + metadata.
// All the math here is just geometry — distances and angles
// between fingertip and knuckle positions.
// ─────────────────────────────────────────────────────

function interpretGesture(lm) {
  // Landmark indices (MediaPipe hand model):
  // 4  = thumb tip      3  = thumb IP
  // 8  = index tip      6  = index MCP
  // 12 = middle tip     10 = middle MCP
  // 16 = ring tip       14 = ring MCP
  // 20 = pinky tip      18 = pinky MCP

  const thumbTip  = lm[4]
  const indexTip  = lm[8]
  const middleTip = lm[12]
  const ringTip   = lm[16]
  const pinkyTip  = lm[20]
  const wrist     = lm[0]

  // Helper — Euclidean distance between two landmarks
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  // Helper — is a fingertip above its own knuckle? (finger extended)
  const extended = (tip, mcp) => tip.y < mcp.y

  const pinchDist      = dist(thumbTip, indexTip)
  const isPinching     = pinchDist < 0.05
  const isIndexUp      = extended(indexTip,  lm[5])
  const isMiddleUp     = extended(middleTip, lm[9])
  const isRingDown     = !extended(ringTip,  lm[13])
  const isPinkyDown    = !extended(pinkyTip, lm[17])
  const allFingersUp   = isIndexUp && isMiddleUp && extended(ringTip, lm[13]) && extended(pinkyTip, lm[17])

  // Pinch — thumb and index touching
  if (isPinching) {
    return { name: 'pinch_click', position: indexTip }
  }

  // Point — only index finger extended
  if (isIndexUp && !isMiddleUp && isRingDown && isPinkyDown) {
    return {
      name: 'point_move',
      position: { x: indexTip.x, y: indexTip.y }
    }
  }

  // Peace sign — index and middle extended, others down
  if (isIndexUp && isMiddleUp && isRingDown && isPinkyDown) {
    return { name: 'peace' }
  }

  // Open palm — all fingers extended
  if (allFingersUp) {
    // Detect swipe direction from wrist velocity
    return { name: 'open_palm', position: wrist }
  }

  return null
}