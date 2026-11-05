import { router } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../../audio/AudioService';
import { brick, bricks, lessonContent as content, tier } from '../../content';
import { adaptForSilence, formulaOf } from '../../core/exercise/generate';
import { createLessonState, currentStep, lessonProgress, lessonReducer, type LessonPlan } from '../../core/exercise/lesson';
import { steleProgress, steleWords } from '../../core/progress/collections';
import { refreshBossDoor } from '../../core/progress/progress';
import { hasUsefulWork } from '../../core/session/expedition';
import { beginPlan, enterStep, finishPlan, recordAnswer } from '../../core/session/run';
import { wearOf } from '../../core/srs/memory';
import type { SrsEngine } from '../../core/srs/types';
import { useProgress } from '../../data/ProgressContext';
import { repository } from '../../data/repository';
import { PrimaryButton, QuietButton } from '../components';
import { colors, MAX_WIDTH } from '../theme';
import { ExerciseView, exerciseAudio } from './ExerciseView';
import { ClueStep, FeedbackPanel, HypothesisStep, IntroStep, PresentStep, UnsealStep } from './StepViews';

const SILENCE_MS = 15 * 60 * 1000;
let silentUntil = 0; // « Pas de son maintenant » dure 15 minutes, d'une leçon à l'autre.

export function goSilentForAWhile() {
  silentUntil = Date.now() + SILENCE_MS;
  audio.stop();
}

/** Revient aux onglets, sur celui que le joueur avait quitté. */
export function goToMap() {
  audio.stop();
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

export function ScreenFrame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

interface Props {
  plan: LessonPlan;
  engine: SrsEngine;
  onRestart: () => void; // nouvelle leçon : Retenter ou Encore 5 minutes
}

export function LessonRun({ plan, engine, onRestart }: Props) {
  const { progress, commit, now } = useProgress();
  const [state, dispatch] = useReducer(lessonReducer, plan, createLessonState);
  const [silent, setSilent] = useState(() => Date.now() < silentUntil);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [sessionId] = useState(() => `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const recorded = useRef(0);
  const seen = useRef(new Set<string>());
  const entered = useRef(-1);
  // La mémoire au début de la session, pour montrer ce qui a été restauré.
  const [startR] = useState(() => new Map(Object.values(progress.cards).map((c) => [c.elementId, engine.retrievability(c.state, now())])));

  const [steleStart] = useState(() => steleProgress(steleWords(tier.stele.en, bricks, progress)).known);

  const step = currentStep(state);

  useEffect(() => {
    commit((p) => beginPlan(p, plan));
    repository.startSession(sessionId, plan.kind, JSON.stringify(plan.steps.map((s) => s.kind)), now());
    // Une seule fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chaque réponse est enregistrée aussitôt : la session peut s'arrêter à tout moment.
  useEffect(() => {
    const fresh = state.answers.slice(recorded.current);
    recorded.current = state.answers.length;
    for (const a of fresh) commit((p) => recordAnswer(p, a, seen.current, sessionId, engine, now()));
  }, [state.answers, commit, engine, now, sessionId]);

  useEffect(() => {
    if (entered.current === state.index) return;
    entered.current = state.index;
    commit((p) => enterStep(p, step, engine, now()));
  }, [state.index, step, commit, engine, now]);

  useEffect(() => {
    if (state.stage !== 'done') return;
    audio.stop();
    commit((p) => refreshBossDoor(tier, finishPlan(p, state, content, now()), engine, now()));
    repository.endSession(sessionId, state.answers.length, now());
    // À la fin de la session uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage]);

  useEffect(() => () => audio.stop(), []);

  // Permet aux tests de navigateur de lire l'exercice en cours. Absent de la version finale.
  useEffect(() => {
    if (__DEV__) (globalThis as { __lesson?: unknown }).__lesson = { state, content };
  }, [state]);

  const goSilent = () => {
    goSilentForAWhile();
    setSilent(true);
  };
  const next = () => dispatch({ type: 'NEXT' });

  const restored = useMemo(() => {
    if (state.stage !== 'done') return [];
    return Object.values(progress.cards).filter((c) => {
      const before = startR.get(c.elementId);
      if (before === undefined || c.elementType !== 'brick') return false;
      return wearOf(before) !== 'neuve' && wearOf(engine.retrievability(c.state, now())) === 'neuve';
    });
  }, [state.stage, progress.cards, startR, engine, now]);

  if (state.stage === 'trial_failed') {
    const formula = formulaOf(content, tier.nodes.find((n) => n.id === plan.nodeId)!.formulaId!);
    return (
      <ScreenFrame>
        <View style={styles.box} testID="trial-failed">
          <Text style={styles.title}>{`${state.trialCorrect} sur ${state.trialTotal}`}</Text>
          <Text style={styles.body}>
            Il faut au moins {formula.trial.passMin} réponses justes, et la dernière phrase doit être juste. Voici la règle, en clair.
          </Text>
          <Text style={styles.pattern}>{formula.pattern}</Text>
          <Text style={styles.body}>{formula.ruleText}</Text>
          <PrimaryButton label="Retenter" testID="retry-trial" onPress={onRestart} />
          <QuietButton label="Retour" testID="to-map" onPress={goToMap} />
        </View>
      </ScreenFrame>
    );
  }

  if (state.stage === 'done') {
    const first = state.answers.filter((a) => !a.isRetry);
    const right = first.filter((a) => a.result.correct).length;
    const missed = state.answers.filter((a) => !a.result.correct);
    const newBricks = state.steps.filter((s) => s.kind === 'present').length;
    const nodeDone = !!plan.nodeId && progress.nodes[plan.nodeId]?.status === 'completed';
    const useful = hasUsefulWork({ content, progress, engine, now: now() });
    const stele = steleProgress(steleWords(tier.stele.en, bricks, progress));
    const unmasked = stele.known - steleStart;
    return (
      <ScreenFrame>
        <View style={styles.box} testID="lesson-done">
          <Text style={styles.title}>{nodeDone ? 'Nœud terminé' : 'Bilan'}</Text>
          <Text style={styles.body} testID="done-score">{`${right} réponses justes du premier coup, sur ${first.length}.`}</Text>
          {newBricks ? <Text style={styles.body}>{`${newBricks} nouvelle${newBricks > 1 ? 's' : ''} brique${newBricks > 1 ? 's' : ''}.`}</Text> : null}
          {unmasked > 0 ? (
            <Text style={styles.body} testID="done-unmasked">
              {`Sur la Stèle, ${unmasked} mot${unmasked > 1 ? 's' : ''} de plus : ${stele.known} sur ${stele.total}.${stele.complete ? ' Tu peux la lire en entier.' : ''}`}
            </Text>
          ) : null}
          {restored.length ? (
            <View style={styles.block} testID="done-restored">
              <Text style={styles.subtitle}>{`Briques restaurées : ${restored.length}`}</Text>
              <Text style={styles.body}>{restored.map((c) => brick(c.elementId).en).join(', ')}</Text>
            </View>
          ) : null}
          {missed.length ? (
            <View style={styles.block}>
              <Text style={styles.subtitle}>À retenir</Text>
              {[...new Set(missed.map((m) => m.result.aRetenir))].map((text) => (
                <Text key={text} style={styles.retain}>{text}</Text>
              ))}
            </View>
          ) : null}
          {useful ? <PrimaryButton label="Encore 5 minutes" testID="again" onPress={onRestart} /> : null}
          <PrimaryButton label="Retour" testID="to-map" onPress={goToMap} />
        </View>
      </ScreenFrame>
    );
  }

  if (!step) return null;

  const exercise = step.kind === 'exercise' ? (silent ? adaptForSilence(step.exercise) : step.exercise) : null;
  const sound = exercise ? exerciseAudio(exercise) : null;
  const nodeId = plan.nodeId ?? tier.nodes[tier.nodes.length - 2].id;

  return (
    <ScreenFrame>
      <View style={styles.top}>
        <View style={styles.bar} accessibilityRole="progressbar">
          <View style={[styles.barFill, { width: `${Math.round(lessonProgress(state) * 100)}%` }]} />
        </View>
        <Pressable accessibilityRole="button" testID="quit" onPress={() => (confirmQuit ? goToMap() : setConfirmQuit(true))}>
          <Text style={styles.quit}>{confirmQuit ? 'Quitter ?' : 'Quitter'}</Text>
        </Pressable>
      </View>

      {step.kind === 'intro' ? <IntroStep key={state.index} text={step.text} onNext={next} /> : null}
      {step.kind === 'present' ? <PresentStep key={state.index} brickId={step.brickId} nodeId={nodeId} silent={silent} onNext={next} /> : null}
      {step.kind === 'clue' ? <ClueStep key={state.index} sentenceId={step.sentenceId} silent={silent} onNext={next} /> : null}
      {step.kind === 'hypothesis' ? <HypothesisStep key={state.index} formulaId={step.formulaId} onNext={next} /> : null}
      {step.kind === 'unseal' ? <UnsealStep key={state.index} formulaId={step.formulaId} onNext={next} /> : null}
      {exercise ? (
        <ExerciseView
          key={state.index}
          exercise={exercise}
          locked={state.stage === 'feedback'}
          silent={silent}
          onAnswer={(result, replays) => dispatch({ type: 'ANSWER', result, replays })}
        />
      ) : null}
      {state.stage === 'feedback' && state.lastResult ? (
        <FeedbackPanel result={state.lastResult} clip={sound?.clip ?? null} silent={silent} onNext={next} />
      ) : null}

      {silent ? (
        <Text style={styles.silentNote}>Exercices écrits pendant 15 minutes.</Text>
      ) : (
        <Pressable accessibilityRole="button" testID="no-sound" onPress={goSilent} style={styles.noSound}>
          <Text style={styles.quit}>Pas de son maintenant</Text>
        </Pressable>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 20, gap: 18, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flexGrow: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.flameOut, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.flame },
  quit: { color: colors.inkQuiet, fontSize: 13, textDecorationLine: 'underline' },
  noSound: { marginTop: 'auto', alignItems: 'center', paddingTop: 12 },
  silentNote: { marginTop: 'auto', color: colors.inkQuiet, fontSize: 13, textAlign: 'center', paddingTop: 12 },
  box: { gap: 14 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  pattern: { color: colors.gold, fontSize: 17 },
  block: { gap: 6, borderTopWidth: 1, borderTopColor: colors.stoneEdge, paddingTop: 12 },
  retain: { color: colors.gold, fontSize: 15, lineHeight: 21 },
});
