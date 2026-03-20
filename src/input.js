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
  constructor(bindings = DEFAULT_BINDINGS) {
    this.keysDown = new Set();
    this.justPressed = new Set();
    this.bindings = { ...DEFAULT_BINDINGS, ...bindings };
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) this.justPressed.add(e.code);
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
  }

  bindAction(action, keys) {
    this.bindings[action] = keys;
  }

  isActionDown(action) {
    const keys = this.bindings[action] || [];
    return keys.some((code) => this.keysDown.has(code));
  }

  wasActionPressed(action) {
    const keys = this.bindings[action] || [];
    return keys.some((code) => this.justPressed.has(code));
  }

  clearFrameState() {
    this.justPressed.clear();
  }
}
