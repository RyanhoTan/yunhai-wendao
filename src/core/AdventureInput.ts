export class AdventureInput {
  readonly keys = new Set<string>();
  private presses = new Set<string>();
  yaw = 0;
  pitch = 0.28;
  distance = 7.5;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clear);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerUp);
    canvas.addEventListener('lostpointercapture', this.pointerUp);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', this.contextMenu);
  }
  take(key: string): boolean { const v = this.presses.has(key); this.presses.delete(key); return v; }
  clear = (): void => { this.keys.clear(); this.presses.clear(); this.dragging = false; };
  private keyDown = (event: KeyboardEvent): void => {
    if ((event.target as HTMLElement)?.matches('input,textarea,select')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && !(event.target as HTMLElement)?.closest('button')) event.preventDefault();
    if (!event.repeat) this.presses.add(event.code);
    this.keys.add(event.code);
  };
  private keyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
  private pointerDown = (event: PointerEvent): void => {
    if (event.button === 0) this.presses.add('Attack');
    if (event.button === 2) { this.dragging = true; this.lastX = event.clientX; this.lastY = event.clientY; this.canvas.setPointerCapture(event.pointerId); }
  };
  private pointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.yaw -= (event.clientX - this.lastX) * 0.005;
    this.pitch = Math.max(0.05, Math.min(1.05, this.pitch + (event.clientY - this.lastY) * 0.004));
    this.lastX = event.clientX; this.lastY = event.clientY;
  };
  private pointerUp = (): void => { this.dragging = false; };
  private wheel = (event: WheelEvent): void => { event.preventDefault(); this.distance = Math.max(4, Math.min(18, this.distance + event.deltaY * 0.012)); };
  private contextMenu = (event: Event): void => { event.preventDefault(); };
  dispose(): void {
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp); window.removeEventListener('blur', this.clear);
    this.canvas.removeEventListener('pointerdown', this.pointerDown); this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp); this.canvas.removeEventListener('pointercancel', this.pointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.pointerUp); this.canvas.removeEventListener('wheel', this.wheel); this.canvas.removeEventListener('contextmenu', this.contextMenu);
  }
}
