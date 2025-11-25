import * as Tone from 'tone';

class AudioService {
    private leadSynth: Tone.PolySynth | null = null;
    private bassSynth: Tone.Synth | null = null;
    private drumSynth: Tone.MembraneSynth | null = null;
    private noiseSynth: Tone.NoiseSynth | null = null;

    private isMuted: boolean = false;
    private isInitialized: boolean = false;

    private currentParts: Tone.Part[] = [];
    private currentLoop: Tone.Loop | null = null;

    constructor() { }

    async initialize() {
        if (this.isInitialized) return;

        await Tone.start();

        // Lead Synth - 8-bit Square with some vibrato
        this.leadSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "square" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 }
        }).toDestination();
        this.leadSynth.volume.value = -12;

        // Bass Synth - Triangle for depth
        this.bassSynth = new Tone.Synth({
            oscillator: { type: "triangle" },
            envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.4 }
        }).toDestination();
        this.bassSynth.volume.value = -8;

        // Kick Drum
        this.drumSynth = new Tone.MembraneSynth().toDestination();
        this.drumSynth.volume.value = -6;

        // Snare/Hi-hat (Noise)
        this.noiseSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.1, sustain: 0 }
        }).toDestination();
        this.noiseSynth.volume.value = -15;

        this.isInitialized = true;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        Tone.Destination.mute = this.isMuted;
        return this.isMuted;
    }

    stopAll() {
        Tone.Transport.stop();
        Tone.Transport.cancel(0);

        this.currentParts.forEach(part => {
            try {
                part.dispose();
            } catch (e) {
                console.warn("Error disposing part:", e);
            }
        });
        this.currentParts = [];

        if (this.currentLoop) {
            try {
                this.currentLoop.dispose();
            } catch (e) {
                console.warn("Error disposing loop:", e);
            }
            this.currentLoop = null;
        }
    }

    // --- Music Themes ---

    playMenuTheme() {
        this.stopAll();
        if (!this.isInitialized) return;

        Tone.Transport.bpm.value = 110;

        // Catchy A-Section Melody
        const melodyPart = new Tone.Part((time, note) => {
            this.leadSynth?.triggerAttackRelease(note.note, note.duration, time);
        }, [
            { time: "0:0", note: "E4", duration: "8n" },
            { time: "0:0:2", note: "G4", duration: "8n" },
            { time: "0:1", note: "B4", duration: "8n" },
            { time: "0:1:2", note: "A4", duration: "8n" },
            { time: "0:2", note: "G4", duration: "8n" },
            { time: "0:2:2", note: "E4", duration: "8n" },
            { time: "0:3", note: "D4", duration: "4n" },

            { time: "1:0", note: "E4", duration: "8n" },
            { time: "1:0:2", note: "G4", duration: "8n" },
            { time: "1:1", note: "B4", duration: "8n" },
            { time: "1:1:2", note: "D5", duration: "8n" },
            { time: "1:2", note: "C5", duration: "8n" },
            { time: "1:2:2", note: "B4", duration: "8n" },
            { time: "1:3", note: "A4", duration: "4n" },
        ]);
        melodyPart.loop = true;
        melodyPart.loopEnd = "2m";

        // Bouncy Bass
        const bassPart = new Tone.Part((time, note) => {
            this.bassSynth?.triggerAttackRelease(note.note, note.duration, time);
        }, [
            { time: "0:0", note: "E2", duration: "8n" },
            { time: "0:0:2", note: "E2", duration: "8n" },
            { time: "0:1", note: "E2", duration: "8n" },
            { time: "0:2", note: "A2", duration: "8n" },
            { time: "0:3", note: "B2", duration: "8n" },

            { time: "1:0", note: "E2", duration: "8n" },
            { time: "1:1", note: "G2", duration: "8n" },
            { time: "1:2", note: "A2", duration: "8n" },
            { time: "1:3", note: "B2", duration: "8n" },
        ]);
        bassPart.loop = true;
        bassPart.loopEnd = "2m";

        // Simple Beat
        const drumLoop = new Tone.Loop((time) => {
            this.drumSynth?.triggerAttackRelease("C1", "8n", time);
            this.noiseSynth?.triggerAttackRelease("8n", time + Tone.Time("4n").toSeconds());
        }, "2n");

        melodyPart.start(0);
        bassPart.start(0);
        drumLoop.start(0);

        this.currentParts.push(melodyPart, bassPart);
        this.currentLoop = drumLoop;

        Tone.Transport.start();
    }

    playGameTheme() {
        this.stopAll();
        if (!this.isInitialized) return;

        Tone.Transport.bpm.value = 132;

        // Driving Bassline
        const bassPart = new Tone.Part((time, note) => {
            this.bassSynth?.triggerAttackRelease(note.note, note.duration, time);
        }, [
            { time: "0:0", note: "C2", duration: "16n" },
            { time: "0:0:2", note: "C2", duration: "16n" },
            { time: "0:1", note: "G2", duration: "16n" },
            { time: "0:1:2", note: "C2", duration: "16n" },
            { time: "0:2", note: "F2", duration: "16n" },
            { time: "0:2:2", note: "F2", duration: "16n" },
            { time: "0:3", note: "C2", duration: "16n" },
            { time: "0:3:2", note: "G2", duration: "16n" },
        ]);
        bassPart.loop = true;
        bassPart.loopEnd = "1m";

        // Arpeggiated Lead
        const arpPart = new Tone.Part((time, note) => {
            this.leadSynth?.triggerAttackRelease(note.note, note.duration, time);
        }, [
            { time: "0:0", note: "C4", duration: "16n" },
            { time: "0:0:2", note: "E4", duration: "16n" },
            { time: "0:1", note: "G4", duration: "16n" },
            { time: "0:1:2", note: "C5", duration: "16n" },
            { time: "0:2", note: "E5", duration: "16n" },
            { time: "0:2:2", note: "C5", duration: "16n" },
            { time: "0:3", note: "G4", duration: "16n" },
            { time: "0:3:2", note: "E4", duration: "16n" },
        ]);
        arpPart.loop = true;
        arpPart.loopEnd = "1m";

        // Driving Beat
        const drumLoop = new Tone.Loop((time) => {
            this.drumSynth?.triggerAttackRelease("C1", "16n", time);
            this.noiseSynth?.triggerAttackRelease("16n", time + Tone.Time("8n").toSeconds());
            this.drumSynth?.triggerAttackRelease("C1", "16n", time + Tone.Time("4n").toSeconds());
            this.noiseSynth?.triggerAttackRelease("16n", time + Tone.Time("4n").toSeconds() + Tone.Time("8n").toSeconds());
        }, "2n");

        bassPart.start(0);
        arpPart.start(0);
        drumLoop.start(0);

        this.currentParts.push(bassPart, arpPart);
        this.currentLoop = drumLoop;

        Tone.Transport.start();
    }

    playYetiChase() {
        this.stopAll();
        if (!this.isInitialized) return;

        Tone.Transport.bpm.value = 170; // Panic speed!

        // Dissonant Panic Lead
        const panicPart = new Tone.Part((time, note) => {
            this.leadSynth?.triggerAttackRelease(note.note, note.duration, time);
        }, [
            { time: "0:0", note: "C5", duration: "32n" },
            { time: "0:0:2", note: "F#4", duration: "32n" },
            { time: "0:1", note: "C5", duration: "32n" },
            { time: "0:1:2", note: "F#4", duration: "32n" },
            { time: "0:2", note: "D5", duration: "32n" },
            { time: "0:2:2", note: "G#4", duration: "32n" },
            { time: "0:3", note: "D5", duration: "32n" },
            { time: "0:3:2", note: "G#4", duration: "32n" },
        ]);
        panicPart.loop = true;
        panicPart.loopEnd = "1m";

        // Heavy Thumping Bass
        const bassPart = new Tone.Part((time, note) => {
            this.bassSynth?.triggerAttackRelease(note.note, note.duration, time);
        }, [
            { time: "0:0", note: "C2", duration: "8n" },
            { time: "0:1", note: "C2", duration: "8n" },
            { time: "0:2", note: "C2", duration: "8n" },
            { time: "0:3", note: "C2", duration: "8n" },
        ]);
        bassPart.loop = true;
        bassPart.loopEnd = "1m";

        // Chaotic Drums
        const drumLoop = new Tone.Loop((time) => {
            this.drumSynth?.triggerAttackRelease("C1", "16n", time);
            this.noiseSynth?.triggerAttackRelease("32n", time + 0.1);
            this.drumSynth?.triggerAttackRelease("C1", "16n", time + 0.2);
            this.noiseSynth?.triggerAttackRelease("32n", time + 0.3);
        }, "4n");

        panicPart.start(0);
        bassPart.start(0);
        drumLoop.start(0);

        this.currentParts.push(panicPart, bassPart);
        this.currentLoop = drumLoop;

        Tone.Transport.start();
    }

    playVictory() {
        this.stopAll();
        if (!this.isInitialized) return;

        const now = Tone.now();
        // Fanfare
        this.leadSynth?.triggerAttackRelease("C4", "8n", now);
        this.leadSynth?.triggerAttackRelease("E4", "8n", now + 0.1);
        this.leadSynth?.triggerAttackRelease("G4", "8n", now + 0.2);
        this.leadSynth?.triggerAttackRelease("C5", "4n", now + 0.3);

        this.bassSynth?.triggerAttackRelease("C3", "2n", now);

        setTimeout(() => {
            this.leadSynth?.triggerAttackRelease("E5", "4n", Tone.now());
            this.leadSynth?.triggerAttackRelease("G5", "2n", Tone.now() + 0.3);
        }, 600);
    }

    playGameOver() {
        this.stopAll();
        if (!this.isInitialized) return;

        const now = Tone.now();
        // Sad Slide
        this.leadSynth?.triggerAttackRelease("G4", "4n", now);
        this.leadSynth?.triggerAttackRelease("F#4", "4n", now + 0.3);
        this.leadSynth?.triggerAttackRelease("F4", "4n", now + 0.6);
        this.leadSynth?.triggerAttackRelease("E4", "1n", now + 0.9);

        this.bassSynth?.triggerAttackRelease("G2", "1n", now);
    }
}

export const audioService = new AudioService();
