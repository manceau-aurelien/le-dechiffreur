import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { audio } from '../../audio/AudioService';
import { lessonContent as content, sayClip } from '../../content';
import { brick, formulaOf, sentence, sentencesUpTo } from '../../core/exercise/generate';
import type { CheckResult, Voice } from '../../core/exercise/types';
import { PrimaryButton, QuietButton } from '../components';
import { colors } from '../theme';

const voices: Voice[] = ['voiceA', 'voiceB'];
const voiceFor = (seed: string): Voice => voices[seed.length % 2];

function useClipOnOpen(clip: string, silent: boolean, delay = 0) {
  useEffect(() => {
    if (silent) return;
    const timer = setTimeout(() => audio.play(clip), delay);
    return () => {
      clearTimeout(timer);
      audio.stop();
    };
  }, [clip, silent, delay]);
}

export function IntroStep({ text, onNext }: { text: string; onNext: () => void }) {
  return (
    <View style={styles.box} testID="step-intro">
      <Text style={styles.anna}>« {text} »</Text>
      <Text style={styles.signature}>Anna</Text>
      <PrimaryButton label="Continuer" testID="next" onPress={onNext} />
    </View>
  );
}

/** Le son d'abord, puis le mot : l'oreille avant les yeux (§3.1). */
export function PresentStep({ brickId, nodeId, silent, onNext }: { brickId: string; nodeId: string; silent: boolean; onNext: () => void }) {
  const b = brick(content, brickId);
  const clip = sayClip(voiceFor(b.en), b.en);
  const [visible, setVisible] = useState(silent);
  useClipOnOpen(clip, silent);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);
  const example = sentencesUpTo(content, nodeId).find((s) => s.bricks.includes(brickId));

  return (
    <View style={styles.box} testID="step-present">
      <Text style={styles.instruction}>Nouvelle brique</Text>
      {visible ? (
        <>
          <Text style={styles.word} testID="present-word">{b.en}</Text>
          <Text style={styles.meaning}>{b.fr.join(', ')}</Text>
          {b.note ? <Text style={styles.note}>{b.note}</Text> : null}
          {example ? (
            <Pressable accessibilityRole="button" testID="example" onPress={() => !silent && audio.play(sayClip(voiceFor(example.en), example.en))} style={styles.example}>
              <Text style={styles.exampleEn}>{example.en}</Text>
              <Text style={styles.exampleFr}>{example.fr}</Text>
            </Pressable>
          ) : null}
          {silent ? null : <QuietButton label="Réécouter" testID="listen-again" onPress={() => audio.play(clip)} />}
          <PrimaryButton label="Continuer" testID="next" onPress={onNext} />
        </>
      ) : null}
    </View>
  );
}

export function ClueStep({ sentenceId, silent, onNext }: { sentenceId: string; silent: boolean; onNext: () => void }) {
  const s = sentence(content, sentenceId);
  const clip = sayClip(voiceFor(s.en), s.en);
  useClipOnOpen(clip, silent, 200);
  return (
    <View style={styles.box} testID="step-clue">
      <Text style={styles.instruction}>Indice : observe</Text>
      <Text style={styles.word}>{s.en}</Text>
      <Text style={styles.meaning}>{s.fr}</Text>
      {silent ? null : <QuietButton label="Réécouter" testID="listen-again" onPress={() => audio.play(clip)} />}
      <PrimaryButton label="Continuer" testID="next" onPress={onNext} />
    </View>
  );
}

/** L'hypothèse : une erreur ne coûte rien, Anna explique et le joueur rechoisit (§3.2). */
export function HypothesisStep({ formulaId, onNext }: { formulaId: string; onNext: () => void }) {
  const f = formulaOf(content, formulaId);
  const [chosen, setChosen] = useState<number | null>(null);
  const option = chosen === null ? null : f.hypothesis.options[chosen];
  return (
    <View style={styles.box} testID="step-hypothesis">
      <Text style={styles.instruction}>Ton hypothèse</Text>
      <Text style={styles.question}>{f.hypothesis.question}</Text>
      {f.hypothesis.options.map((o, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          testID={`hypothesis-${i}`}
          disabled={option?.correct === true}
          onPress={() => setChosen(i)}
          style={[styles.choice, chosen === i && (o.correct ? styles.choiceRight : styles.choiceWrong)]}
        >
          <Text style={styles.choiceText}>{o.text}</Text>
        </Pressable>
      ))}
      {option ? <Text style={styles.anna} testID="hypothesis-why">« {option.why} »</Text> : null}
      {option?.correct ? <PrimaryButton label="À l'épreuve" testID="next" onPress={onNext} /> : null}
    </View>
  );
}

export function UnsealStep({ formulaId, onNext }: { formulaId: string; onNext: () => void }) {
  const f = formulaOf(content, formulaId);
  return (
    <View style={styles.box} testID="step-unseal">
      <Text style={styles.instruction}>Formule descellée</Text>
      <Text style={styles.word}>{f.title}</Text>
      <Text style={styles.pattern}>{f.pattern}</Text>
      <Text style={styles.rule}>{f.ruleText}</Text>
      <PrimaryButton label="Continuer" testID="next" onPress={onNext} />
    </View>
  );
}

/** La fiche après une réponse. Une erreur dit toujours pourquoi, et ce qu'il faut retenir. */
export function FeedbackPanel({ result, clip, silent, onNext }: { result: CheckResult; clip: string | null; silent: boolean; onNext: () => void }) {
  useEffect(() => {
    if (silent || !clip) return;
    const timer = setTimeout(() => audio.play(clip), 150);
    return () => {
      clearTimeout(timer);
      audio.stop();
    };
  }, [clip, silent]);

  if (result.correct) {
    return (
      <View style={[styles.panel, styles.panelRight]} testID="feedback-right">
        <Text style={styles.right}>{result.almost ? 'Presque : une petite faute de frappe.' : 'Juste.'}</Text>
        {result.almost ? <Text style={styles.expected}>{result.expected}</Text> : null}
        <PrimaryButton label="Continuer" testID="next" onPress={onNext} />
      </View>
    );
  }
  return (
    <View style={[styles.panel, styles.panelWrong]} testID="feedback-wrong">
      <Text style={styles.wrong}>Pas tout à fait.</Text>
      <Text style={styles.label}>La bonne réponse</Text>
      <Text style={styles.expected} testID="feedback-expected">{result.expected}</Text>
      {result.diff.length ? (
        <Text style={styles.diff}>
          {result.diff.map((d, i) => (
            <Text key={i} style={d.status === 'same' ? styles.diffSame : d.status === 'missing' ? styles.diffMissing : styles.diffExtra}>
              {`${d.word} `}
            </Text>
          ))}
        </Text>
      ) : null}
      <Text style={styles.label}>Pourquoi</Text>
      <Text style={styles.why} testID="feedback-why">{result.pourquoi}</Text>
      <Text style={styles.label}>À retenir</Text>
      <Text style={styles.retain} testID="feedback-retain">{result.aRetenir}</Text>
      {clip && !silent ? <QuietButton label="Écouter" testID="feedback-listen" onPress={() => audio.play(clip)} /> : null}
      <PrimaryButton label="Continuer" testID="next" onPress={onNext} />
    </View>
  );
}


const styles = StyleSheet.create({
  box: { gap: 14 },
  instruction: { color: colors.inkQuiet, fontSize: 15 },
  word: { color: colors.ink, fontSize: 32, fontWeight: '700' },
  meaning: { color: colors.ink, fontSize: 20 },
  note: { color: colors.gold, fontSize: 15, lineHeight: 21 },
  example: { borderLeftWidth: 2, borderLeftColor: colors.stoneEdge, paddingLeft: 12, gap: 2 },
  exampleEn: { color: colors.ink, fontSize: 17 },
  exampleFr: { color: colors.inkQuiet, fontSize: 15 },
  anna: { color: colors.ink, fontSize: 18, fontStyle: 'italic', lineHeight: 26 },
  signature: { color: colors.inkQuiet, fontSize: 14, alignSelf: 'flex-end' },
  question: { color: colors.ink, fontSize: 21, fontWeight: '600' },
  choice: { backgroundColor: colors.brick, borderColor: colors.brickEdge, borderWidth: 1, borderRadius: 10, padding: 14 },
  choiceRight: { borderColor: colors.good, borderWidth: 2 },
  choiceWrong: { borderColor: colors.bad, borderWidth: 2 },
  choiceText: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  pattern: { color: colors.gold, fontSize: 17 },
  rule: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  panel: { borderRadius: 12, padding: 16, gap: 8, borderWidth: 1, marginTop: 8 },
  panelRight: { borderColor: colors.good, backgroundColor: '#23291f' },
  panelWrong: { borderColor: colors.bad, backgroundColor: '#2b211f' },
  right: { color: colors.good, fontSize: 18, fontWeight: '700' },
  wrong: { color: colors.bad, fontSize: 18, fontWeight: '700' },
  label: { color: colors.inkQuiet, fontSize: 13, marginTop: 4 },
  expected: { color: colors.ink, fontSize: 19, fontWeight: '600' },
  why: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  retain: { color: colors.gold, fontSize: 16, lineHeight: 22, marginBottom: 6 },
  diff: { fontSize: 15, lineHeight: 22 },
  diffSame: { color: colors.inkQuiet },
  diffMissing: { color: colors.good, fontWeight: '700' },
  diffExtra: { color: colors.bad, textDecorationLine: 'line-through' },
});
