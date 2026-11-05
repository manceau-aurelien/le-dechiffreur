import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { audio } from '../audio/AudioService';
import { brick, sayClip, tier } from '../content';
import { useProgress } from '../data/ProgressContext';
import { BrickTile, PrimaryButton, QuietButton } from '../ui/components';
import { goSilentForAWhile } from '../ui/lesson/LessonRun';
import { colors, MAX_WIDTH } from '../ui/theme';

/** Le premier lancement : une phrase de contexte, un test du son, puis la première brique (§2.5). */
export default function WelcomeScreen() {
  const { commit } = useProgress();
  const [played, setPlayed] = useState(false);
  const firstBrick = brick('b.hello');

  const start = () => {
    audio.stop();
    commit((p) => ({ ...p, onboarded: true }));
    router.replace('/expedition');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content} testID="welcome">
        <Text style={styles.story}>{tier.texts.firstLaunch}</Text>
        <View style={styles.block}>
          <Text style={styles.hint}>Touche cette brique pour vérifier le son.</Text>
          <BrickTile
            label={firstBrick.en}
            testID="welcome-brick"
            onPress={async () => {
              setPlayed(true);
              await audio.play(sayClip('voiceA', firstBrick.en));
            }}
          />
        </View>
        <PrimaryButton label="Commencer" testID="welcome-start" disabled={!played} onPress={start} />
        <QuietButton
          label="Pas de son maintenant"
          testID="welcome-no-sound"
          onPress={() => {
            goSilentForAWhile();
            start();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stoneLight, justifyContent: 'center' },
  content: { padding: 26, gap: 26, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  story: { color: colors.ink, fontSize: 22, lineHeight: 32, fontStyle: 'italic' },
  block: { gap: 12, alignItems: 'flex-start' },
  hint: { color: colors.inkQuiet, fontSize: 15 },
});
