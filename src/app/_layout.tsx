import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProgressProvider } from '../data/ProgressContext';
import { BossSessionProvider } from '../ui/BossSession';
import { DatabaseBusy } from '../ui/DatabaseBusy';
import { colors } from '../ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ProgressProvider>
        <BossSessionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'none',
              gestureEnabled: false,
              contentStyle: { backgroundColor: colors.lair },
            }}
          />
          <DatabaseBusy />
        </BossSessionProvider>
      </ProgressProvider>
    </SafeAreaProvider>
  );
}
