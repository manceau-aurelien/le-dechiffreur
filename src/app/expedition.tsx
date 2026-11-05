import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lessonContent as content } from '../content';
import { composeExpedition, composePreparation } from '../core/session/expedition';
import type { SrsEngine } from '../core/srs/types';
import { useProgress } from '../data/ProgressContext';
import { PrimaryButton } from '../ui/components';
import { goToMap, LessonRun, ScreenFrame } from '../ui/lesson/LessonRun';
import { colors } from '../ui/theme';

/** L'Expédition de 5 minutes, ou la Préparation au boss si des éléments sont fournis. */
export default function ExpeditionScreen() {
  const { engine, loaded } = useProgress();
  const { elements } = useLocalSearchParams<{ elements?: string }>();
  if (!loaded || !engine) return <View style={styles.screen} />;
  return <Expedition engine={engine} elements={elements ? elements.split(',') : null} />;
}

function Expedition({ engine, elements }: { engine: SrsEngine; elements: string[] | null }) {
  const { progress, now } = useProgress();
  const compose = (useElements: boolean) => {
    const ctx = { content, progress, engine, now: now(), rng: Math.random };
    return useElements && elements ? composePreparation(elements, ctx) : composeExpedition(ctx);
  };
  const [plan, setPlan] = useState(() => compose(true));
  const [run, setRun] = useState(0);

  if (!plan.steps.length) {
    return (
      <ScreenFrame>
        <View style={styles.box} testID="nothing-due">
          <Text style={styles.title}>Rien d&apos;urgent</Text>
          <Text style={styles.body}>Tes briques tiennent bon. Reviens quand tu veux.</Text>
          <PrimaryButton label="Retour" testID="to-map" onPress={goToMap} />
        </View>
      </ScreenFrame>
    );
  }

  return (
    <LessonRun
      key={run}
      plan={plan}
      engine={engine}
      onRestart={() => {
        // Toujours une nouvelle Expédition, même après une Préparation.
        setPlan(compose(false));
        setRun((r) => r + 1);
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  box: { gap: 14 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
});
