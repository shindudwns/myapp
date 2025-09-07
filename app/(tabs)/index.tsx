import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Button, Platform, StyleSheet } from 'react-native';


export default function HomeScreen() {
  const [count, setCount] = useState(0);

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }
    >
      {/* 제목 영역 */}
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">영준님, 첫 앱 스타트! 🚀</ThemedText>
        <HelloWave />
      </ThemedView>

      {/* 안내 대신 우리 기능 넣기 */}
      <ThemedView style={styles.section}>
        <ThemedText>아래 버튼을 눌러보세요.</ThemedText>
        <ThemedText type="subtitle">클릭 수: {count}</ThemedText>
        <Button title="눌러보기" onPress={() => setCount((c) => c + 1)} />
      </ThemedView>

      {/* 개발자 메뉴/도움말은 간단히 유지 */}
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">개발자 팁</ThemedText>
        <ThemedText>
          파일 저장하면 자동으로 새로고침돼요. 개발자 메뉴는{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          으로 열 수 있어요.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  section: {
    gap: 10,
    marginBottom: 16,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
