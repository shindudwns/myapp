// app.config.ts
import 'dotenv/config';

export default {
  expo: {
    name: 'myapp',
    slug: 'myapp',
    scheme: 'myapp',
    newArchEnabled: true,

    // JS에서 process.env로 읽을 키
    extra: {
      EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    },

    ios: {
      bundleIdentifier: 'com.anonymous.myapp',
      // iOS 권한 문구 + comgooglemaps 스킴 허용
      infoPlist: {
        NSLocationWhenInUseUsageDescription: '주변 정보를 표시하기 위해 위치가 필요합니다.',
        NSLocationAlwaysAndWhenInUseUsageDescription: '주변 정보를 표시하기 위해 위치가 필요합니다.',
        LSApplicationQueriesSchemes: ['comgooglemaps'], // 외부 구글맵 열기 허용
      },
    },

    android: {
      package: 'com.anonymous.myapp',
      // Android 권한은 여기 두고,
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
      // (참고) Android 네이티브 구글맵 키 설정은 plugin이 같이 해줌
    },

    plugins: [
      'expo-router',
      // ✅ iOS에 Google Maps SDK를 링크하고 GMSApiKey를 주입
      ['react-native-maps', {
        ios: { googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY },
        android: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY }
      }],
    ],
  },
};
