const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE', 'Space'],
  pause: ['Escape'],
  debug: ['Backquote'],
};

export class InputManager {
  constructor() {
    this.keysDown = new Set();
    this.justPressed = new Set();
    this.bindings = DEFAULT_BINDINGS;
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) this.justPressed.add(e.code);
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
  }

  isActionDown(action) {
    return this.bindings[action].some((code) => this.keysDown.has(code));
  }

  wasActionPressed(action) {
    return this.bindings[action].some((code) => this.justPressed.has(code));
  }

  clearFrameState() {
    this.justPressed.clear();
  }
}
