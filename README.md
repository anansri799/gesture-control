# GestureControl

Touchless computer control for people with ALS and motor disabilities. Uses your built-in webcam to track hand gestures in real time and translate them into system input events, including cursor movement, clicks, scrolls, and desktop navigation. No additional hardware while storing no data.

> **Status:** Active development. Core gesture pipeline works. Intentionality thresholds and tremor filtering are being actively tuned. Not yet ready for patient use.

---

## How It Works

```
Webcam frame → MediaPipe (21 landmarks) → Kalman filter → Gesture interpreter → OS input injection
```

Every frame is processed in memory and immediately discarded. The app behaves like a keyboard, and it fires input events and stores nothing. No database, no logs, no network calls during operation.

### The Tremor Problem

ALS and Parkinson's cause involuntary hand tremors oscillating at **4–12 Hz**. Intentional movement happens at **0–3 Hz**. A naive smoothing filter (EMA) can't distinguish these, as it smooths everything, including fast intentional gestures.

GestureControl implements a **2D Kalman filter** from scratch, treating cursor tracking as a state estimation problem. The filter maintains a state vector `[position, velocity]` for each axis and runs two steps per frame:

```
Predict:  x = F·x          (project state forward using motion model)
          P = F·P·Fᵀ + Q   (project uncertainty forward)

Update:   K = P / (P + R)  (Kalman gain — how much to trust the measurement)
          x = x + K·(measurement - x)
          P = (1 - K)·P
```

`R` (measurement noise) is the primary tuning dial — higher values filter tremors more aggressively. This is exposed as a `tremorLevel` setting (`mild / moderate / severe`) that remaps `R` at runtime without restarting the filter.

---

## Gesture Map

| Hand | Gesture | Action |
|------|---------|--------|
| Either | One finger point | Move cursor |
| Left | Pinch (short, < 400ms) | Left click |
| Left | Pinch + move | Drag |
| Right | Two fingers stationary | Right click |
| Right | Two fingers moving | Scroll (continuous, velocity-scaled) |
| Right | Four fingers swipe left/right | Switch desktop spaces |
| Right | Four fingers swipe up | Mission Control |
| Right | Four fingers swipe down | App Exposé |

**Handedness note:** MediaPipe labels hands from its own perspective (mirrored). The app corrects for this by labeling `handedness === 'Right'` from MediaPipe maps to the user's left hand.

---

## Architecture

```
gesture-app/
├── main.js                  # Electron main process — window management, IPC, app lifecycle
├── overlay.html             # Transparent fullscreen HUD — camera, MediaPipe, skeleton drawing
├── src/
│   ├── preload.js           # contextBridge — controlled IPC between renderer and main
│   ├── injector.js          # OS input injection via @nut-tree-fork/nut-js
│   ├── interpreter.js       # Stateful gesture interpreter — velocity, swipe direction
│   ├── kalman-filter.js     # 2D Kalman filter implementation (no external dependencies)
│   └── tremor-filter.js     # Adaptive EMA fallback filter
└── assets/
    └── icon.png             # Tray icon
```

### Key Design Decisions

**Why Electron?** Native OS input injection requires Node.js access (`nut-js` talks to the macOS accessibility layer). Electron gives us a browser renderer for MediaPipe/WebGL and a Node backend for system control in one package.

**Why MediaPipe in the renderer?** MediaPipe Hands uses WebAssembly + WebGL for GPU-accelerated inference. Running it in the Electron renderer gives access to `getUserMedia` and the GPU without needing native bindings.

**Why IPC for gestures?** The renderer detects gestures but can't inject OS input (sandboxed). The main process can inject input but can't access the camera. `ipcRenderer.send` bridges them, as gesture events are small serializable objects,so latency is negligible.

**Why no data persistence?** Deliberate. The app is designed for vulnerable users who should not have to trust a third party with their behavioral data. No `electron-store`, no SQLite, no log files. Settings reset on restart (persistence coming via encrypted local config, opt-in).

---

## Setup

**Requirements:**
- Node.js 18+
- macOS (Windows/Linux support planned)
- Built-in or USB webcam

**Install:**
```bash
git clone https://github.com/anansri799/gesture-control.git
cd gesture-control
npm install
```

**Run:**
```bash
npx electron .
```

**macOS permissions:** On first run, macOS will ask for camera access and accessibility permissions. Both are required. Accessibility permission is needed for `nut-js` to inject mouse and keyboard events system-wide.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| App shell | Electron 29 |
| Hand tracking | MediaPipe Hands 0.4 (Lite model, on-device) |
| Tremor filtering | Custom 2D Kalman filter |
| OS input | @nut-tree-fork/nut-js 4.2 |
| IPC | Electron contextBridge + ipcRenderer |

**MediaPipe model:** Lite (complexity 0). Runs at ~8ms inference on a modern MacBook. Full model adds ~10ms with negligible accuracy improvement for landmark detection.

**Latency budget:**
```
Camera capture:     ~33ms  (1000 / 30fps)
Frame decode:       ~4ms
MediaPipe inference:~8ms
Kalman update:      <1ms
Gesture confirm:    N × 33ms  (N = confirmation frames, default 3)
IPC + injection:    ~2ms
─────────────────────────
Total (no buffer):  ~48ms
Total (3 frames):   ~147ms
```

Confirmation frames are the dominant latency cost. Cursor movement (`point_move`) bypasses confirmation and fires every frame for smooth tracking.

---

## Known Issues

- **Right click misfiring** — two-finger stationary detection is too sensitive. Threshold tuning in progress.
- **Gesture bleed** — pinch occasionally triggers while pointing. Finger extension dead zone needs widening.
- **IPC bridge** — `window.gestureAPI` intermittently undefined on cold start. Investigating preload load order.
- **Cursor jumping** — Kalman filter resets on hand re-entry cause position discontinuity. Adding entry interpolation.
- **macOS only** — `nut-js` bindings need rebuild for Windows. Linux untested.

---

## Roadmap

**Next:**
- [ ] Fix IPC reliability issue
- [ ] Dwell clicking (hover to click — for late-stage ALS, no pinch required)
- [ ] Onboarding calibration flow (range of motion mapping)
- [ ] Tremor level setting persisted to local config

**Later:**
- [ ] Windows support
- [ ] Parkinson's tremor profile (higher R, tighter dead zones)
- [ ] Spinal cord injury mode (arm-sweep gestures, no finger precision required)
- [ ] Open-source release with org distribution

---

## Contributing

This project is being built for real patients. If you're an occupational therapist, assistive technology specialist, or ALS patient willing to give feedback, that is more valuable than code right now.

For code contributions, open an issue first. The gesture thresholds and Kalman tuning are the most impactful areas.

---

## Why This Exists

Existing eye-tracking solutions cost $3,000–$15,000 and require dedicated hardware. GestureControl requires only the webcam already built into a patient's laptop. The goal is to make touchless computer control accessible to anyone who needs it, regardless of what they can afford.

Built by Ananya Sriram — Math & CS, Carnegie Mellon University.  
Reach out: github.com/anansri799/gesture-control

---

## License

MIT — free to use, modify, and distribute.