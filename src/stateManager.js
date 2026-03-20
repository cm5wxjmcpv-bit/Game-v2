export const GAME_STATES = Object.freeze({
  MAIN_MENU: 'main_menu',
  CLASS_SELECT: 'class_select',
  TOWN: 'town',
  LEVEL: 'level',
  SHOP: 'shop',
  PAUSE: 'pause',
  GAME_OVER: 'game_over',
});

export class StateManager {
  constructor(initialState) {
    this.current = initialState;
    this.previous = null;
    this.pausedFrom = null;
  }

  set(state) {
    this.previous = this.current;
    this.current = state;
  }

  pause() {
    if (this.current === GAME_STATES.PAUSE) return;
    this.pausedFrom = this.current;
    this.set(GAME_STATES.PAUSE);
  }

  resume(defaultState = GAME_STATES.TOWN) {
    const target = this.pausedFrom || this.previous || defaultState;
    this.set(target);
    this.pausedFrom = null;
  }

  is(state) {
    return this.current === state;
  }
}
