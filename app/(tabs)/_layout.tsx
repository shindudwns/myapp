/** app/(tabs)/_layout.tsx */
import { Tabs } from 'expo-router';
import { View } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: { backgroundColor: '#fff' }, // 기본(지도 등) 탭
      }}
    >
      <Tabs.Screen name="map" options={{ title: '지도' }} />
      <Tabs.Screen
        name="hud"
        options={{
          title: 'HUD',
          // ✅ HUD 탭만 투명 + 흰 글씨(화면을 가리지 않음)
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
          tabBarLabelStyle: { fontWeight: '800' },
          tabBarBackground: () => <View style={{ flex: 1, backgroundColor: 'transparent' }} />,
        }}
      />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
    </Tabs>
  );
}
