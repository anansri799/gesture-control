// src/injector.js
// Translates confirmed gestures into OS-level input events.
// Uses @nut-tree-fork/nut-js which talks directly to the macOS
// accessibility layer — same path a physical mouse uses.

const { mouse, keyboard, Key, Button, straightTo, Point } = require('@nut-tree-fork/nut-js')

// Mouse movement speed in pixels per second
// Higher = snappier but harder to control precisely
mouse.config.mouseSpeed = 1500

/**
 * Receives a confirmed gesture event and fires the
 * corresponding system input action.
 *
 * @param {object} event - { gesture, position, velocity }
 */
async function inject(event) {
  const { gesture, position, velocity } = event

  switch (gesture) {

    // Point finger → move cursor to that screen position
    case 'point_move': {
      if (!position) break
      await mouse.move(straightTo(new Point(position.x, position.y)))
      break
    }

    // Pinch → left click at current cursor position
    case 'pinch_click': {
      await mouse.click(Button.LEFT)
      break
    }

    // Swipes → scroll. Velocity scales the scroll amount
    // so a fast swipe scrolls more than a slow one
    case 'swipe_up': {
      const amount = Math.max(1, Math.round(velocity * 6))
      await mouse.scrollUp(amount)
      break
    }

    case 'swipe_down': {
      const amount = Math.max(1, Math.round(velocity * 6))
      await mouse.scrollDown(amount)
      break
    }

    // Horizontal swipes → switch desktop spaces on macOS
    case 'swipe_right': {
      await keyboard.pressKey(Key.LeftControl, Key.Right)
      await keyboard.releaseKey(Key.LeftControl, Key.Right)
      break
    }

    case 'swipe_left': {
      await keyboard.pressKey(Key.LeftControl, Key.Left)
      await keyboard.releaseKey(Key.LeftControl, Key.Left)
      break
    }

    // Peace sign → right click context menu
    case 'peace': {
      await mouse.click(Button.RIGHT)
      break
    }
  }
}

module.exports = { inject }