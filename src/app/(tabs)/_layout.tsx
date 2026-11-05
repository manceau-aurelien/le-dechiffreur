import { Tabs } from 'expo-router/js-tabs';
import { colors } from '../../ui/theme';

/** Quatre onglets : Camp, Carte, Mur et Carnet (§2.5). */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.flame,
        tabBarInactiveTintColor: colors.inkQuiet,
        tabBarStyle: { backgroundColor: '#201e1b', borderTopColor: colors.stoneEdge },
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
        tabBarLabelPosition: 'beside-icon',
        sceneStyle: { backgroundColor: colors.stoneLight },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Camp', tabBarIcon: () => null, tabBarButtonTestID: 'tab-camp' }} />
      <Tabs.Screen name="carte" options={{ title: 'Carte', tabBarIcon: () => null, tabBarButtonTestID: 'tab-carte' }} />
      <Tabs.Screen name="mur" options={{ title: 'Mur', tabBarIcon: () => null, tabBarButtonTestID: 'tab-mur' }} />
      <Tabs.Screen name="carnet" options={{ title: 'Carnet', tabBarIcon: () => null, tabBarButtonTestID: 'tab-carnet' }} />
    </Tabs>
  );
}
