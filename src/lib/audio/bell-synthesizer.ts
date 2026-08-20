/**
 * Zero-asset Web Audio Synthesizer for Mindful Practice & Meditation.
 * Synthesizes pure harmonic Tibetan bowls, temple bells, interval chimes,
 * and woodblock sounds using native AudioContext oscillators.
 */

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioContext = new AudioCtx();
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

export function resetAudioContextForTesting(): void {
  sharedAudioContext = null;
}

export type SoundType = 'tibetan_bowl' | 'temple_bell' | 'interval_ping' | 'woodblock';

export interface SoundOptions {
  volume?: number;      // 0.0 to 1.0 (default 0.7)
  duration?: number;    // in seconds
}

/**
 * Resonant Tibetan Singing Bowl
 * Fundamental with multiple inharmonic and harmonic overtones + subtle beating.
 */
export function playTibetanBowl(options: SoundOptions = {}): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const volume = Math.max(0, Math.min(1, options.volume ?? 0.7));
  const duration = options.duration ?? 4.5;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(volume * 0.5, now);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  // Partial frequencies and relative amplitudes for Tibetan singing bowl acoustics
  const partials = [
    { freq: 216.0, gain: 1.0, decay: duration },       // Fundamental (A3)
    { freq: 217.2, gain: 0.8, decay: duration * 0.9 }, // Slight detune creating soothing acoustic beating
    { freq: 594.0, gain: 0.5, decay: duration * 0.7 }, // 2.75x overtone
    { freq: 1040.0, gain: 0.25, decay: duration * 0.5 },// 4.81x overtone
    { freq: 1620.0, gain: 0.1, decay: duration * 0.35 },// 7.5x shimmer
  ];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    const pGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.freq, now);

    pGain.gain.setValueAtTime(p.gain, now);
    pGain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

    osc.connect(pGain);
    pGain.connect(masterGain);

    osc.start(now);
    osc.stop(now + p.decay);
  }
}

/**
 * Clear Japanese Temple Bell (Rin Gong)
 */
export function playTempleBell(options: SoundOptions = {}): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const volume = Math.max(0, Math.min(1, options.volume ?? 0.7));
  const duration = options.duration ?? 3.0;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(volume * 0.6, now);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const partials = [
    { freq: 440.0, gain: 1.0, decay: duration },
    { freq: 880.0, gain: 0.4, decay: duration * 0.6 },
    { freq: 1320.0, gain: 0.2, decay: duration * 0.4 },
    { freq: 2200.0, gain: 0.08, decay: duration * 0.2 },
  ];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    const pGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.freq, now);

    pGain.gain.setValueAtTime(p.gain, now);
    pGain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

    osc.connect(pGain);
    pGain.connect(masterGain);

    osc.start(now);
    osc.stop(now + p.decay);
  }
}

/**
 * Gentle Interval Ping (Soft reminder during practice)
 */
export function playIntervalPing(options: SoundOptions = {}): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const volume = Math.max(0, Math.min(1, options.volume ?? 0.6));
  const duration = options.duration ?? 1.2;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(volume * 0.5, now);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(659.25, now); // E5 note

  osc.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Traditional Wooden Temple Block (Mokugyo)
 */
export function playWoodblock(options: SoundOptions = {}): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const volume = Math.max(0, Math.min(1, options.volume ?? 0.7));
  const duration = 0.08;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(750, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + duration);

  osc.connect(gain);
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Play a specific sound by identifier.
 */
export function playPracticeSound(sound: SoundType, options?: SoundOptions): void {
  switch (sound) {
    case 'tibetan_bowl':
      playTibetanBowl(options);
      break;
    case 'temple_bell':
      playTempleBell(options);
      break;
    case 'interval_ping':
      playIntervalPing(options);
      break;
    case 'woodblock':
      playWoodblock(options);
      break;
  }
}
