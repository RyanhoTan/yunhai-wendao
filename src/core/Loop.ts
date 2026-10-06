export class Loop {
  private frameId = 0;
  private lastTime: number | null = null;
  private running = false;

  constructor(
    private readonly update: (deltaSeconds: number, elapsedSeconds: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    // A frame timestamp may predate expensive synchronous scene setup.
    // Establish the clock in the first callback rather than mixing clocks.
    this.lastTime = null;
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private readonly tick = (time: number) => {
    if (!this.running) return;
    const deltaSeconds = this.lastTime === null ? 0 : Math.max(0, Math.min((time - this.lastTime) / 1000, 0.05));
    this.lastTime = time;
    this.update(deltaSeconds, time / 1000);
    this.render();
    this.frameId = requestAnimationFrame(this.tick);
  };
}
