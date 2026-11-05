import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { audio } from '../../audio/AudioService';
import { lessonContent as content, sayClip } from '../../content';
import { checkBrickChoice, checkCorrection, checkEnglish, checkFrench, checkOption } from '../../core/exercise/check';
import { authored, brick, sentence } from '../../core/exercise/generate';
import type { CheckResult, Exercise } from '../../core/exercise/types';
import { BrickTile, PrimaryButton, QuietButton } from '../components';
import { colors } from '../theme';

interface Props {
  exercise: Exercise;
  locked: boolean; // la fiche de réponse est ouverte
  silent: boolean; // « Pas de son maintenant »
  onAnswer: (result: CheckResult) => void;
}

const INSTRUCTIONS: Record<Exercise['type'], string> = {
  E2: 'Quelle brique entends-tu ?',
  E3: 'Que veut dire ce mot ?',
  E4: 'Quelle brique veut dire cela ?',
  E5: 'Assemble cette phrase en anglais.',
  E6: 'Assemble ce que tu entends.',
  E7: 'Traduis en français.',
  E8: 'Écris cette phrase en anglais.',
  E9: 'Choisis la bonne version.',
  E10: 'Touche la brique fausse.',
  E11: 'Écoute. Que dit le Gardien ?',
};

/** Le texte que l'exercice fait entendre, et avec quelle voix. */
export function exerciseAudio(ex: Exercise): { clip: string; autoplay: boolean } | null {
  switch (ex.type) {
    case 'E2':
    case 'E3':
      return { clip: sayClip(ex.voice, brick(content, ex.brickId).en), autoplay: true };
    case 'E4':
      return { clip: sayClip(ex.voice, brick(content, ex.brickId).en), autoplay: false };
    case 'E5':
    case 'E8':
      return { clip: sayClip(ex.voice, sentence(content, ex.sentenceId).en), autoplay: false };
    case 'E6':
    case 'E7':
      return { clip: sayClip(ex.voice, sentence(content, ex.sentenceId).en), autoplay: true };
    case 'E9': {
      const e = authored(content, ex.authoredId, 'E9');
      // Un énoncé anglais s'entend tout de suite. Un énoncé français révélerait la réponse.
      const englishPrompt = e.prompt === e.audioText;
      return { clip: sayClip(ex.voice, e.audioText), autoplay: englishPrompt };
    }
    case 'E10':
      return { clip: sayClip(ex.voice, authored(content, ex.authoredId, 'E10').audioText), autoplay: false };
    case 'E11': {
      const e = authored(content, ex.authoredId, 'E11');
      return { clip: sayClip('guardian', sentence(content, e.audioSentenceId).en), autoplay: true };
    }
  }
}

export function ExerciseView({ exercise, locked, silent, onAnswer }: Omit<Props, 'onAnswer'> & { onAnswer: (result: CheckResult, replays: number) => void }) {
  const sound = exerciseAudio(exercise);
  const replays = useRef(0);
  const canReplay = !silent && sound?.autoplay;

  useEffect(() => {
    if (silent || !sound?.autoplay) return;
    const timer = setTimeout(() => audio.play(sound.clip), 300);
    return () => {
      clearTimeout(timer);
      audio.stop();
    };
    // Une seule lecture à l'ouverture de l'exercice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.box} testID={`exercise-${exercise.type}`}>
      <Text style={styles.instruction}>{INSTRUCTIONS[exercise.type]}</Text>
      {canReplay ? <QuietButton label="Réécouter" testID="listen-again" onPress={() => { replays.current += 1; audio.play(sound!.clip); }} /> : null}
      <Body exercise={exercise} locked={locked} silent={silent} onAnswer={(result) => onAnswer(result, replays.current)} />
    </View>
  );
}

function Body(props: Props) {
  const { exercise: ex } = props;
  switch (ex.type) {
    case 'E2':
    case 'E3':
    case 'E4':
      return <BrickChoice {...props} exercise={ex} />;
    case 'E5':
    case 'E6':
      return <Assembly {...props} exercise={ex} />;
    case 'E7':
      return <Version {...props} exercise={ex} />;
    case 'E8':
      return <Theme {...props} exercise={ex} />;
    case 'E9':
    case 'E11':
      return <OptionChoice {...props} exercise={ex} />;
    case 'E10':
      return <Correction {...props} exercise={ex} />;
  }
}

function BrickChoice({ exercise: ex, locked, silent, onAnswer }: Props & { exercise: Extract<Exercise, { type: 'E2' | 'E3' | 'E4' }> }) {
  const target = brick(content, ex.brickId);
  return (
    <>
      {ex.type === 'E3' ? <Text style={styles.prompt}>{target.en}</Text> : null}
      {ex.type === 'E4' ? <Text style={styles.prompt}>{target.fr[0]}</Text> : null}
      {ex.type === 'E2' && silent ? <Text style={styles.prompt}>{target.fr[0]}</Text> : null}
      <View style={styles.options}>
        {ex.options.map((id) => {
          const option = brick(content, id);
          return (
            <Choice
              key={id}
              label={ex.type === 'E3' ? option.fr[0] : option.en}
              disabled={locked}
              testID={`option-${id}`}
              onPress={() => onAnswer(checkBrickChoice(target, option))}
            />
          );
        })}
      </View>
    </>
  );
}

function Assembly({ exercise: ex, locked, silent, onAnswer }: Props & { exercise: Extract<Exercise, { type: 'E5' | 'E6' }> }) {
  const [placed, setPlaced] = useState<string[]>([]);
  const s = sentence(content, ex.sentenceId);
  const byKey = new Map(ex.bank.map((b) => [b.key, b]));

  // Dans les leçons, les briques sonnent : l'oreille s'y habitue.
  const place = (key: string) => {
    if (locked) return;
    setPlaced((p) => [...p, key]);
    if (!silent) audio.play(sayClip(ex.voice, brick(content, byKey.get(key)!.brickId).en));
  };
  const seal = () => {
    const raw = placed.map((k) => brick(content, byKey.get(k)!.brickId).en).join(' ');
    onAnswer(checkEnglish(s, raw, content, false));
  };

  return (
    <>
      {ex.type === 'E5' ? <Text style={styles.prompt}>{s.fr}</Text> : null}
      <View style={styles.table} testID="table">
        {placed.map((key) => (
          <BrickTile
            key={key}
            label={brick(content, byKey.get(key)!.brickId).en}
            testID={`placed-${byKey.get(key)!.brickId}`}
            onPress={() => !locked && setPlaced((p) => p.filter((k) => k !== key))}
          />
        ))}
      </View>
      <View style={styles.bank} testID="bank">
        {ex.bank.map((b) => (
          <BrickTile
            key={b.key}
            label={brick(content, b.brickId).en}
            ghost={placed.includes(b.key)}
            testID={`bank-${b.brickId}`}
            onPress={() => place(b.key)}
          />
        ))}
      </View>
      {locked ? null : <PrimaryButton label="Vérifier" testID="check" disabled={!placed.length} onPress={seal} />}
    </>
  );
}

function Version({ exercise: ex, locked, onAnswer }: Props & { exercise: Extract<Exercise, { type: 'E7' }> }) {
  const [placed, setPlaced] = useState<string[]>([]);
  const s = sentence(content, ex.sentenceId);
  const byKey = new Map(ex.tiles.map((t) => [t.key, t]));
  return (
    <>
      <Text style={styles.prompt}>{s.en}</Text>
      <View style={styles.table} testID="table">
        {placed.map((key) => (
          <BrickTile key={key} label={byKey.get(key)!.text} testID={`placed-tile-${key}`} onPress={() => !locked && setPlaced((p) => p.filter((k) => k !== key))} />
        ))}
      </View>
      <View style={styles.bank} testID="bank">
        {ex.tiles.map((t) => (
          <BrickTile
            key={t.key}
            label={t.text}
            ghost={placed.includes(t.key)}
            testID={`tile-${t.key}`}
            onPress={() => !locked && setPlaced((p) => [...p, t.key])}
          />
        ))}
      </View>
      {locked ? null : (
        <PrimaryButton
          label="Vérifier"
          testID="check"
          disabled={!placed.length}
          onPress={() => onAnswer(checkFrench(s, placed.map((k) => byKey.get(k)!.text)))}
        />
      )}
    </>
  );
}

function Theme({ exercise: ex, locked, onAnswer }: Props & { exercise: Extract<Exercise, { type: 'E8' }> }) {
  const [value, setValue] = useState('');
  const s = sentence(content, ex.sentenceId);
  const submit = () => {
    if (value.trim() && !locked) onAnswer(checkEnglish(s, value, content, true));
  };
  return (
    <>
      <Text style={styles.prompt}>{s.fr}</Text>
      <TextInput
        testID="theme-input"
        accessibilityLabel="Ta traduction en anglais"
        style={styles.input}
        value={value}
        onChangeText={setValue}
        editable={!locked}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        autoComplete="off"
        placeholder="Ta phrase en anglais"
        placeholderTextColor={colors.inkQuiet}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {locked ? null : <PrimaryButton label="Vérifier" testID="check" disabled={!value.trim()} onPress={submit} />}
    </>
  );
}

function OptionChoice({ exercise: ex, locked, silent, onAnswer }: Props & { exercise: Extract<Exercise, { type: 'E9' | 'E11' }> }) {
  const e = authored(content, ex.authoredId, ex.type);
  const prompt = e.type === 'E9' ? e.prompt : silent ? sentence(content, e.audioSentenceId).en : null;
  return (
    <>
      {prompt ? <Text style={styles.prompt}>{prompt}</Text> : null}
      <View style={styles.options}>
        {ex.optionOrder.map((i) => (
          <Choice key={i} label={e.options[i].text} disabled={locked} testID={`option-${i}`} onPress={() => onAnswer(checkOption(e, i))} />
        ))}
      </View>
    </>
  );
}

function Correction({ exercise: ex, locked, onAnswer }: Props & { exercise: Extract<Exercise, { type: 'E10' }> }) {
  const e = authored(content, ex.authoredId, 'E10');
  const [tapped, setTapped] = useState<number | null>(null);

  const tap = (index: number) => {
    if (locked) return;
    if (index !== e.wrongIndex) onAnswer(checkCorrection(e, index, null));
    else setTapped(index);
  };

  return (
    <>
      <View style={styles.bank}>
        {e.tokens.map((token, i) => (
          <BrickTile key={i} label={token} testID={`token-${i}`} onPress={() => tap(i)} />
        ))}
      </View>
      {tapped !== null ? (
        <>
          <Text style={styles.subPrompt}>{`Par quoi remplacer « ${e.tokens[tapped]} » ?`}</Text>
          <View style={styles.options}>
            {ex.replacementOrder.map((i) => (
              <Choice
                key={i}
                label={e.replacements[i]}
                disabled={locked}
                testID={`replacement-${i}`}
                onPress={() => onAnswer(checkCorrection(e, tapped, e.replacements[i]))}
              />
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

function Choice(props: { label: string; disabled: boolean; testID: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      testID={props.testID}
      onPress={props.onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.choicePressed, props.disabled && styles.choiceOff]}
    >
      <Text style={styles.choiceText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: 14 },
  instruction: { color: colors.inkQuiet, fontSize: 15 },
  prompt: { color: colors.ink, fontSize: 24, fontWeight: '600', lineHeight: 31 },
  subPrompt: { color: colors.ink, fontSize: 16 },
  options: { gap: 10 },
  choice: { backgroundColor: colors.brick, borderColor: colors.brickEdge, borderWidth: 1, borderRadius: 10, padding: 14 },
  choicePressed: { backgroundColor: '#3f3c45' },
  choiceOff: { opacity: 0.6 },
  choiceText: { color: colors.ink, fontSize: 17, textAlign: 'center' },
  table: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.stoneEdge,
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bank: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  input: {
    color: colors.ink,
    fontSize: 19,
    borderWidth: 1,
    borderColor: colors.stoneEdge,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.brick,
  },
});
