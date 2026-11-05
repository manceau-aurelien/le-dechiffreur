import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { clips } from './audio-manifest';

const UNKNOWN_DURATION_S = 8;
const SAFETY_MARGIN_S = 1.5;
const MAX_PLAYERS = 60;

/** Lecture des clips embarqués. Un seul clip à la fois : le silence du boss en dépend. */
class AudioService {
  private players = new Map<string, AudioPlayer>();
  private stopCurrent: (() => void) | null = null;
  private ready = false;

  private async ensureMode() {
    if (this.ready) return;
    this.ready = true;
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
  }

  private player(clipId: string): AudioPlayer {
    let player = this.players.get(clipId);
    if (!player) {
      const source = clips[clipId];
      if (source === undefined) throw new Error(`Clip audio inconnu : ${clipId}`);
      if (this.players.size >= MAX_PLAYERS) this.evictOldest();
      player = createAudioPlayer(source);
      this.players.set(clipId, player);
    } else {
      // Le plus récemment utilisé passe en fin de file : seuls les vieux clips sont libérés.
      this.players.delete(clipId);
      this.players.set(clipId, player);
    }
    return player;
  }

  private evictOldest() {
    const oldest = this.players.keys().next().value;
    if (oldest === undefined) return;
    this.players.get(oldest)?.remove();
    this.players.delete(oldest);
  }

  /** Précharge les clips du combat pour éviter toute latence avant une phrase. */
  prepare(clipIds: string[]) {
    clipIds.forEach((id) => this.player(id));
  }

  /** Résout quand le clip est fini ou interrompu. */
  async play(clipId: string): Promise<void> {
    await this.ensureMode();
    this.stop();
    const player = this.player(clipId);
    await player.seekTo(0);
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        subscription.remove();
        if (this.stopCurrent === stop) this.stopCurrent = null;
        resolve();
      };
      const stop = () => {
        player.pause();
        finish();
      };
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) finish();
      });
      const seconds = player.duration > 0 ? player.duration : UNKNOWN_DURATION_S;
      const timer = setTimeout(finish, (seconds + SAFETY_MARGIN_S) * 1000);
      this.stopCurrent = stop;
      player.play();
    });
  }

  stop() {
    this.stopCurrent?.();
  }
}

export const audio = new AudioService();
