// src/injector.js
// Translates confirmed gestures into OS-level input events.

const { mouse, keyboard, Key, Button, straightTo, Point } = require('@nut-tree-fork/nut-js')

mouse.config.mouseSpeed = 2000

async function inject(event) {
  const { gesture, position, amount } = event

  switch (gesture) {

    case 'point_move': {
      if (!position) break
      await mouse.move(straightTo(new Point(position.x, position.y)))
      break
    }

    case 'pinch_click': {
      await mouse.click(Button.LEFT)
      break
    }

    case 'pinch_drag': {
      if (!position) break
      await mouse.pressButton(Button.LEFT)
      await mouse.move(straightTo(new Point(position.x, position.y)))
      break
    }

    case 'right_click': {
      await mouse.click(Button.RIGHT)
      break
    }

    case 'scroll_up': {
      await mouse.scrollUp(amount || 3)
      break
    }

    case 'scroll_down': {
      await mouse.scrollDown(amount || 3)
      break
    }

    case 'scroll_left': {
      await mouse.scrollLeft(amount || 3)
      break
    }

    case 'scroll_right': {
      await mouse.scrollRight(amount || 3)
      break
    }

    // Four finger right → next desktop space
    case 'swipe_right': {
      await keyboard.pressKey(Key.LeftControl, Key.Right)
      await keyboard.releaseKey(Key.LeftControl, Key.Right)
      break
    }

    // Four finger left → previous desktop space
    case 'swipe_left': {
      await keyboard.pressKey(Key.LeftControl, Key.Left)
      await keyboard.releaseKey(Key.LeftControl, Key.Left)
      break
    }

    // Four finger up → Mission Control
    case 'swipe_up': {
      await keyboard.pressKey(Key.LeftControl, Key.Up)
      await keyboard.releaseKey(Key.LeftControl, Key.Up)
      break
    }

    // Four finger down → App Exposé
    case 'swipe_down': {
      await keyboard.pressKey(Key.LeftControl, Key.Down)
      await keyboard.releaseKey(Key.LeftControl, Key.Down)
      break
    }
  }
}

module.exports = { inject }