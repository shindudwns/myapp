import { Redirect } from 'expo-router';
export default function Index() {
  return <Redirect href="/(tabs)/map" />;
}
// 홈 탭으로 시작하려면:  return <Redirect href="/(tabs)" />;
