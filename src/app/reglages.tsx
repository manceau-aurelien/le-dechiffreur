import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProgress } from '../data/ProgressContext';
import { PrimaryButton, QuietButton } from '../ui/components';
import { goToMap } from '../ui/lesson/LessonRun';
import { colors, MAX_WIDTH } from '../ui/theme';

const DAY_MS = 86_400_000;

/** Les réglages. Le choix des voix, le rappel et l'export arriveront à l'étape 5. */
export default function SettingsScreen() {
  const { progress, commit, resetAll } = useProgress();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Réglages
        </Text>

        <View style={styles.block}>
          <Text style={styles.heading}>Progression</Text>
          {confirmReset ? (
            <QuietButton
              label="Confirmer : tout effacer"
              testID="reset-confirm"
              onPress={() => {
                resetAll();
                setConfirmReset(false);
                goToMap();
              }}
            />
          ) : (
            <QuietButton label="Remettre la progression à zéro" testID="reset" onPress={() => setConfirmReset(true)} />
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.heading}>Mode développeur</Text>
          <View style={styles.row}>
            <Text style={styles.body}>Tout ouvrir, ignorer les verrous</Text>
            <Switch
              testID="dev-unlock"
              accessibilityLabel="Tout ouvrir, ignorer les verrous"
              value={progress.devUnlockAll}
              onValueChange={(devUnlockAll) => commit((p) => ({ ...p, devUnlockAll }))}
            />
          </View>
          {progress.devUnlockAll ? (
            <View style={styles.buttons}>
              <QuietButton label="Avancer d'un jour" testID="dev-plus-1" onPress={() => commit((p) => ({ ...p, clockOffsetMs: p.clockOffsetMs + DAY_MS }))} />
              <QuietButton label="Avancer de 30 jours" testID="dev-plus-30" onPress={() => commit((p) => ({ ...p, clockOffsetMs: p.clockOffsetMs + 30 * DAY_MS }))} />
            </View>
          ) : null}
          {progress.clockOffsetMs ? <Text style={styles.body} testID="dev-offset">{`Horloge avancée de ${Math.round(progress.clockOffsetMs / DAY_MS)} jours`}</Text> : null}
        </View>

        <PrimaryButton label="Retour" testID="to-map" onPress={goToMap} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight },
  content: { padding: 22, gap: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' },
  block: { gap: 10, borderTopWidth: 1, borderTopColor: colors.stoneEdge, paddingTop: 14 },
  heading: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  body: { color: colors.inkQuiet, fontSize: 14, flexShrink: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  buttons: { flexDirection: 'row', gap: 10 },
});
