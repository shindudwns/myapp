// app.config.ts
import 'dotenv/config';

export default {
  expo: {
    name: 'myapp',
    slug: 'myapp',
    scheme: 'myapp',
    newArchEnabled: true,

    /**
     * Web 서비스용 키(Geocoding/Directions/Roads 등)
     * RN 코드에서 process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY 로 읽습니다.
     */
    extra: {
      EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
      // iOS 지도 SDK 키를 분리해 쓰고 싶으면 .env에 IOS_GMAPS_KEY 추가,
      // 없으면 웹키를 자동 재사용합니다.
      IOS_GMAPS_KEY:
        process.env.IOS_GMAPS_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    },

    /**
     * ✅ react-native-maps 플러그인(설정 플러그인) 제거
     *    → 현재 버전에서는 플러그인으로 인식되지 않아
     *      “Package … does not contain a valid config plugin” 에러가 납니다.
     *    → 대신 아래 ios/android 섹션에서 키를 직접 주입합니다.
     */
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
        /**
         * Android용 Google Maps SDK 키
         * (분리키가 없으면 웹키 재사용)
         */
        googleMaps: {
          apiKey:
            process.env.ANDROID_GMAPS_KEY ??
            process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
        },
      },
    },

    ios: {
      bundleIdentifier: 'com.anonymous.myapp',
      /**
       * 일부 환경에서 SDK가 Info.plist의 GMSApiKey를 직접 참조합니다.
       * 여기에도 넣어 안정적으로 동작하게 합니다.
       */
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          '주변 정보를 표시하기 위해 위치가 필요합니다.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          '내비/속도계 기능을 위해 백그라운드 위치 접근을 허용해주세요.',
        GMSApiKey:
          process.env.IOS_GMAPS_KEY ??
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
      },
      /**
       * (구·신 AppDelegate 모두 커버) iOS Google Maps SDK 키 주입
       */
      config: {
        googleMapsApiKey:
          process.env.IOS_GMAPS_KEY ??
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
      },
    },

    experiments: { typedRoutes: true },
  },
};
