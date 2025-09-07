// app.config.ts
import 'dotenv/config';

export default {
  expo: {
    name: 'myapp',
    slug: 'myapp',
    scheme: 'myapp',
    newArchEnabled: true,

    extra: {
      EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    },

    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
    ],

    android: {
      package: 'com.anonymous.myapp',
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
        },
      },
    },

    ios: {
      bundleIdentifier: 'com.anonymous.myapp',
      // Info.plist에 필요한 키들
      infoPlist: {
        NSLocationWhenInUseUsageDescription: '주변 정보를 표시하기 위해 위치가 필요합니다.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          '내비/속도계 기능을 위해 백그라운드 위치 접근을 허용해주세요.',
        // Google Maps SDK가 읽을 수 있도록 Info.plist에 키를 심어둡니다.
        GMSApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
      },
      // (선택) 일부 버전은 AppDelegate에서 키를 주입해야 해서 아래도 남겨둡니다.
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
      },
    },

    experiments: { typedRoutes: true },
  },
};
