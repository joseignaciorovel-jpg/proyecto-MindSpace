class SoundSystem {
  private muted: boolean = false;
  private ctx: AudioContext | null = null;

  constructor() {
    // Check localstorage for preference on initial load safely in helper
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sound_fx_muted");
      this.muted = saved === "true";
    }
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (typeof window !== "undefined") {
      localStorage.setItem("sound_fx_muted", this.muted ? "true" : "false");
    }
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  playTick() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      
      // Extremely low volume, subtle high frequency tick
      gain.gain.setValueAtTime(0.008, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.03);
    } catch (e) {
      // Browser muted policy
    }
  }

  playPop() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(580, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.07);

      gain.gain.setValueAtTime(0.012, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch (e) {
      // Browser muted policy
    }
  }

  playTransition() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(261.63, ctx.currentTime); // C4
      osc1.frequency.exponentialRampToValueAtTime(329.63, ctx.currentTime + 0.2); // E4

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(392.00, ctx.currentTime); // G4
      osc2.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.2); // C5

      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.2);
    } catch (e) {
      // Browser muted policy
    }
  }

  playChime() {
    if (this.muted) return;
    try {
      const ctx = this.initCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.06); // C6
      osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.12); // E6

      gain.gain.setValueAtTime(0.008, ctx.currentTime);
      gain.gain.setValueAtTime(0.008, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.008, ctx.currentTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Browser muted policy
    }
  }
}

export const soundFX = new SoundSystem();
