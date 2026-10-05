import { createSeededRandom } from '../utils/random';
export type Sound = 'slash' | 'spell' | 'hit' | 'pickup' | 'breakthrough' | 'fly' | 'death' | 'ui' | 'shrine';
export class CultivationAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  private rng = createSeededRandom(771);
  muted = false;
  volume = 0.45;
  played = 0;
  private musicTime = 0;
  private noteIndex = 0;
  get status() { return {state:this.context?.state ?? 'locked',ambience:!!this.wind,activeSources:this.active.size,volume:this.volume}; }
  async unlock(): Promise<void> {
    if (!this.context) { this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination); this.applyVolume(); }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); this.applyVolume(); }
  private applyVolume(): void { if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.04); }
  setMuted(muted: boolean): void { this.muted = muted; this.applyVolume(); }
  private tone(frequency: number, duration: number, amplitude: number, type: OscillatorType = 'sine', endFrequency?: number): void {
    if (!this.context || !this.master || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const source = this.context.createOscillator(), gain = this.context.createGain(); source.type = type;
    source.frequency.setValueAtTime(frequency, now); if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(amplitude, now + 0.009); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(gain).connect(this.master); this.active.add(source);
    source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(); source.stop(now + duration + 0.01);
  }
  play(sound: Sound): void {
    this.played++;
    const vary = 0.97 + this.rng() * 0.06;
    if (sound === 'slash') { this.tone(800 * vary, 0.15, 0.09, 'triangle', 90); }
    if (sound === 'spell') { this.tone(120 * vary, 0.45, 0.15, 'sawtooth', 700); this.tone(660, 0.7, 0.12); }
    if (sound === 'hit') { this.tone(120, 0.18, 0.24, 'triangle', 35); }
    if (sound === 'pickup' || sound === 'ui') { this.tone(880 * vary, 0.4, 0.12); this.tone(1320, 0.6, 0.06); }
    if (sound === 'fly') { this.tone(220, 0.7, 0.08, 'triangle', 880); }
    if (sound === 'death') { this.tone(210, 1.1, 0.17, 'triangle', 45); }
    if (sound === 'shrine' || sound === 'breakthrough') { for (const f of [220, 330, 440, 660, 880]) this.tone(f, 1.8, 0.06); }
  }
  ambience(enabled: boolean): void {
    if (!enabled) { if (this.wind) { this.wind.stop(); this.wind.disconnect(); this.wind = null; } for (const source of this.active) { try { source.stop(); } catch { /* already ended */ } } this.active.clear(); return; }
    if (!this.context || !this.master || this.wind) return;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 5, this.context.sampleRate), values = buffer.getChannelData(0);
    let low = 0; for (let i = 0; i < values.length; i++) { low = low * 0.985 + (this.rng() - 0.5) * 0.018; values[i] = low; }
    this.wind = this.context.createBufferSource(); this.wind.buffer = buffer; this.wind.loop = true;
    this.wind.connect(this.master); this.wind.start();
  }
  update(dt: number): void {
    this.musicTime += dt;
    if (this.musicTime >= 2.8) { this.musicTime = 0; const notes = [220, 330, 440, 495, 660, 440, 330, 293.66]; const f = notes[this.noteIndex++ % notes.length]; this.tone(f, 2.4, 0.042); this.tone(f * 2, 1.2, 0.014); }
  }
  dispose(): void { this.ambience(false); void this.context?.close(); }
}
