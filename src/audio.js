export class AudioSystem {
  constructor() {
    this.enabled = true;
    this.banks = {};
  }

  register(key, src) {
    this.banks[key] = src;
  }

  play(key) {
    if (!this.enabled || !this.banks[key]) return;
    const sfx = new Audio(this.banks[key]);
    sfx.volume = 0.5;
    sfx.play().catch(() => {});
  }
}
