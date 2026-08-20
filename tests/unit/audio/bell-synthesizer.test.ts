import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  playTibetanBowl,
  playTempleBell,
  playIntervalPing,
  playWoodblock,
  playPracticeSound,
  getAudioContext,
  resetAudioContextForTesting,
} from '@/lib/audio/bell-synthesizer';

describe('Web Audio Practice Bell Synthesizer', () => {
  let mockGainNode: {
    connect: ReturnType<typeof vi.fn>;
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
  };

  let mockOscillatorNode: {
    connect: ReturnType<typeof vi.fn>;
    frequency: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    type: string;
  };

  let mockAudioContext: {
    currentTime: number;
    destination: Record<string, unknown>;
    state: string;
    resume: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resetAudioContextForTesting();
    mockGainNode = {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    };

    mockOscillatorNode = {
      connect: vi.fn(),
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      start: vi.fn(),
      stop: vi.fn(),
      type: 'sine',
    };

    mockAudioContext = {
      currentTime: 10,
      destination: {},
      state: 'running',
      resume: vi.fn(),
      createGain: vi.fn(() => mockGainNode),
      createOscillator: vi.fn(() => mockOscillatorNode),
    };

    // Attach mock to window
    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));
  });

  it('instantiates AudioContext and plays Tibetan bowl harmonics', () => {
    playTibetanBowl({ volume: 0.8, duration: 4 });
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockOscillatorNode.start).toHaveBeenCalled();
    expect(mockOscillatorNode.stop).toHaveBeenCalled();
  });

  it('plays temple bell sound', () => {
    playTempleBell({ volume: 0.5 });
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });

  it('plays interval ping sound', () => {
    playIntervalPing();
    expect(mockOscillatorNode.frequency.setValueAtTime).toHaveBeenCalledWith(659.25, 10);
  });

  it('plays woodblock sound with frequency sweep', () => {
    playWoodblock();
    expect(mockOscillatorNode.frequency.setValueAtTime).toHaveBeenCalledWith(750, 10);
    expect(mockOscillatorNode.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it('dispatches sound via playPracticeSound router', () => {
    playPracticeSound('tibetan_bowl');
    playPracticeSound('temple_bell');
    playPracticeSound('interval_ping');
    playPracticeSound('woodblock');
    expect(mockAudioContext.createGain).toHaveBeenCalled();
  });
});
