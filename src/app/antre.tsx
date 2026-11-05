import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../audio/AudioService';
import { boss, bossClip, brick, bricks, tier } from '../content';
import {
  bossReducer,
  buildRound,
  canHear,
  createBossState,
  currentRound,
  drawBossVariants,
  flamesLeft,
  replaysLeft,
  variantIdsOf,
  type BossState,
} from '../core/boss/engine';
import { applyBossResults, blamedElements } from '../core/boss/review';
import { completeNode, refreshBossDoor } from '../core/progress/progress';
import { useProgress } from '../data/ProgressContext';
import { repository } from '../data/repository';
import { bossMemory, useBossSession } from '../ui/BossSession';
import { BrickTile, Flames, GuardianMask, PrimaryButton, QuietButton } from '../ui/components';
import { colors, MAX_WIDTH } from '../ui/theme';

const SILENCE_BEFORE_PHRASE_MS = 800;
const FIRST_ENTRY_MS = 3000;
const NEXT_ENTRY_MS = 1500;
const VERDICT_OK_MS = 1000;
const MUTED_SPEECH_MS = 1500;

export default function Lair() {
  const session = useBossSession();
  const { progress, engine, commit, now } = useProgress();
  const params = useLocalSearchParams<{ resume?: string }>();
  const [attempt] = useState(() => {
    const resume = params.resume ? bossMemory.resume : null;
    return resume ? { id: resume.attemptId, startedAt: now(), resumed: resume.state } : { id: `a-${Date.now()}`, startedAt: now(), resumed: null };
  });
  const [state, dispatch] = useReducer(bossReducer, null, (): BossState => {
    if (attempt.resumed) {
      // Reprise au rang en cours, avec une phrase retirée au sort (§2.6).
      const s = attempt.resumed;
      const rank = boss.ranks[s.index];
      const others = rank.variants.filter((v) => v.id !== s.rounds[s.index].variant.id);
      const variant = others[Math.floor(Math.random() * others.length)];
      return bossReducer(s, { type: 'RESUME', round: buildRound(rank.order, variant, Math.random) });
    }
    // Les phrases contenant les briques les plus usées sortent plus souvent.
    const t = now();
    const retrievability = (id: string) => {
      const card = progress.cards[id];
      return card && engine ? engine.retrievability(card.state, t) : 1;
    };
    return createBossState(boss, drawBossVariants(boss, bossMemory.lastDrawn, retrievability, Math.random), Math.random);
  });
  const [entering, setEntering] = useState(true);
  const [firstEntry] = useState(() => !bossMemory.hasEntered);
  const [speaking, setSpeaking] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const lastPlayedRank = useRef(-1);
  const hearingRef = useRef(true);
  const { muted, showMeanings, haptics } = session.settings;

  const round = currentRound(state);

  useEffect(() => {
    bossMemory.lastDrawn = variantIdsOf(state);
    bossMemory.hasEntered = true;
    bossMemory.resume = null;
    state.rounds.forEach((r) => audio.prepare([bossClip(r.variant.id), bossClip(r.variant.id, true)]));
    const timer = setTimeout(() => setEntering(false), firstEntry ? FIRST_ENTRY_MS : NEXT_ENTRY_MS);
    return () => {
      clearTimeout(timer);
      audio.stop();
    };
    // Une seule fois, à l'entrée dans l'antre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La seule source de son : la voix du Gardien.
  useEffect(() => {
    if (entering || !canHear(state)) return;
    const newRank = lastPlayedRank.current !== state.index;
    lastPlayedRank.current = state.index;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (!hearingRef.current) return;
        setSpeaking(true);
        if (muted) await new Promise((resolve) => setTimeout(resolve, MUTED_SPEECH_MS));
        else await audio.play(bossClip(round.variant.id, state.audio.slow));
        if (!cancelled) setSpeaking(false);
      },
      newRank ? SILENCE_BEFORE_PHRASE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setSpeaking(false);
    };
    // Rejoué uniquement quand le moteur demande une lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.audio.nonce, entering]);

  // Le verdict coupe la voix : la carte d'erreur et la pause de réussite sont silencieuses.
  const hearing = canHear(state);
  useEffect(() => {
    hearingRef.current = hearing;
    if (!hearing) audio.stop();
  }, [hearing]);

  useEffect(() => {
    if (state.stage !== 'verdict_ok') return;
    const timer = setTimeout(() => dispatch({ type: 'CONTINUE' }), VERDICT_OK_MS);
    return () => clearTimeout(timer);
  }, [state.stage, state.index]);

  // Le combat est enregistré à chaque changement d'étape : il reprend même après une fermeture.
  useEffect(() => {
    repository.saveBossAttempt(attempt.id, boss.id, state, attempt.startedAt, now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage, state.index]);

  useEffect(() => {
    if (state.stage === 'won' || state.stage === 'lost') {
      bossMemory.defeatsInARow = state.stage === 'lost' ? bossMemory.defeatsInARow + 1 : 0;
      session.setLastCombat(state);
      session.setLastBlamed(blamedElements(state, bricks));
      if (engine) {
        const bossNodeId = tier.nodes[tier.nodes.length - 1].id;
        commit((p) => {
          const { next, logs } = applyBossResults(p, state, bricks, engine, now());
          const opened = refreshBossDoor(tier, next, engine, now());
          return { next: state.stage === 'won' ? completeNode(opened, bossNodeId, now()) : opened, logs };
        });
      }
      router.replace('/debrief');
    } else if (state.stage === 'abandoned') {
      router.replace('/antichambre');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage]);

  const place = (key: string) => {
    if (haptics && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: 'PLACE', key });
  };

  if (entering) {
    return (
      <View style={styles.entry} testID="lair-entry">
        {firstEntry ? <Text style={styles.entryText}>{tier.texts.firstEntry}</Text> : null}
      </View>
    );
  }

  const label = (brickId: string) => brick(brickId).en;
  const meaning = (brickId: string) => (showMeanings ? brick(brickId).fr[0] : undefined);
  const bankByKey = new Map(round.bank.map((b) => [b.key, b]));

  return (
    <SafeAreaView style={styles.screen}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: Math.min(state.errors, 3) * 0.15 }]} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Flames left={flamesLeft(state)} total={state.rules.allowedErrors} />
          <Text style={styles.rank} testID="rank-label">{`Rang ${round.rank} / ${state.rounds.length}`}</Text>
        </View>

        <GuardianMask speaking={speaking} />

        {canHear(state) ? (
          <View style={styles.earRow}>
            <QuietButton
              label={`Faire répéter (${replaysLeft(state)})`}
              testID="replay"
              disabled={speaking || replaysLeft(state) <= 0}
              onPress={() => dispatch({ type: 'REPLAY' })}
            />
            <QuietButton
              label={`Ralentir (${state.slowLeft})`}
              testID="slow"
              disabled={speaking || state.slowLeft <= 0}
              onPress={() => dispatch({ type: 'SLOW' })}
            />
          </View>
        ) : null}

        {state.stage === 'build' ? (
          <View style={styles.board}>
            <View style={styles.table} testID="table">
              {state.placed.map((key) => {
                const b = bankByKey.get(key)!;
                return (
                  <BrickTile
                    key={key}
                    label={label(b.brickId)}
                    meaning={meaning(b.brickId)}
                    testID={`placed-${b.brickId}`}
                    onPress={() => dispatch({ type: 'REMOVE', key })}
                  />
                );
              })}
            </View>
            <View style={styles.bank} testID="bank">
              {round.bank.map((b) => {
                const isPlaced = state.placed.includes(b.key);
                return (
                  <BrickTile
                    key={b.key}
                    label={label(b.brickId)}
                    meaning={meaning(b.brickId)}
                    ghost={isPlaced}
                    testID={`bank-${b.brickId}`}
                    onPress={() => place(b.key)}
                  />
                );
              })}
            </View>
            <PrimaryButton
              label="Sceller"
              testID="seal"
              disabled={state.placed.length === 0}
              onPress={() => dispatch({ type: 'SEAL' })}
            />
          </View>
        ) : null}

        {state.stage === 'riposte' && round.variant.riposte ? (
          <View style={styles.board}>
            <Text style={styles.question} testID="riposte-question">
              {round.variant.riposte.question}
            </Text>
            {round.riposteOrder.map((i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                testID={`riposte-${i}`}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                onPress={() => dispatch({ type: 'ANSWER', option: i })}
              >
                <Text style={styles.optionText}>{round.variant.riposte!.options[i].text}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {state.stage === 'verdict_ok' ? <Text style={styles.okText} testID="verdict-ok">Le Gardien se tait un instant.</Text> : null}

        {state.stage === 'verdict_error' ? (
          <View style={styles.card} testID="verdict-error">
            <Text style={styles.cardLabel}>
              {flamesLeft(state) === 0 && state.errors <= state.rules.allowedErrors ? 'Ta dernière flamme s\'éteint.' : 'Une flamme s\'éteint.'}
            </Text>
            <Text style={styles.cardLabel}>Le Gardien a dit :</Text>
            <Text style={styles.cardPhrase}>{round.variant.audio}</Text>
            <Text style={styles.cardFr}>{round.variant.fr}</Text>
            <Text style={styles.cardRetain}>À retenir : {round.variant.aRetenir}</Text>
            <PrimaryButton label="Continuer" testID="continue" onPress={() => dispatch({ type: 'CONTINUE' })} />
          </View>
        ) : null}

        <View style={styles.abandon}>
          {confirmAbandon ? (
            <QuietButton label="Confirmer l'abandon" testID="abandon-confirm" onPress={() => dispatch({ type: 'ABANDON' })} />
          ) : (
            <Pressable accessibilityRole="button" testID="abandon" onPress={() => setConfirmAbandon(true)}>
              <Text style={styles.abandonText}>Abandonner</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  entry: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 },
  entryText: { color: colors.inkQuiet, fontSize: 20, fontStyle: 'italic', textAlign: 'center' },
  screen: { flex: 1, backgroundColor: colors.lair },
  content: { padding: 20, gap: 18, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flexGrow: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rank: { color: colors.inkQuiet, fontSize: 14 },
  earRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  board: { gap: 14 },
  table: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: '#3a3840',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bank: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  question: { color: colors.ink, fontSize: 19, fontWeight: '600', textAlign: 'center' },
  option: { borderWidth: 1, borderColor: colors.brickEdge, borderRadius: 8, padding: 14, backgroundColor: colors.brick },
  optionPressed: { backgroundColor: '#3f3c45' },
  optionText: { color: colors.ink, fontSize: 16, textAlign: 'center' },
  okText: { color: colors.inkQuiet, textAlign: 'center', fontSize: 15, fontStyle: 'italic' },
  card: { gap: 8, backgroundColor: '#100f13', borderRadius: 10, padding: 18, borderWidth: 1, borderColor: '#3a3840' },
  cardLabel: { color: colors.inkQuiet, fontSize: 14 },
  cardPhrase: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  cardFr: { color: colors.ink, fontSize: 16 },
  cardRetain: { color: colors.gold, fontSize: 15, lineHeight: 21, marginBottom: 8 },
  abandon: { marginTop: 'auto', alignItems: 'center', paddingTop: 12 },
  abandonText: { color: colors.inkQuiet, fontSize: 13, textDecorationLine: 'underline' },
});
