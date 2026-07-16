export class InputController {
  constructor() {
    this.keys = new Set();
    this.enabled = false;

    window.addEventListener('keydown', (event) => {
      if (this.isMovementKey(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });

    window.addEventListener('keyup', (event) => {
      if (this.isMovementKey(event.code)) {
        event.preventDefault();
        this.keys.delete(event.code);
      }
    });

    window.addEventListener('blur', () => this.keys.clear());
  }

  isMovementKey(code) {
    return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
  }

  getState() {
    if (!this.enabled) return { up: false, down: false, left: false, right: false };
    return {
      up: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      down: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.keys.clear();
  }
}
