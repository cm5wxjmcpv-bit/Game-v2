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
  }

  set(state) {
    this.previous = this.current;
    this.current = state;
  }

  is(state) {
    return this.current === state;
  }
}
