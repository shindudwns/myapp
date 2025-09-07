// app/(tabs)/map.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Keyboard, Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

// 한국 위주면 'KR', 미국 위주면 'US', 혼용이면 ''
const COUNTRY_BIAS = 'KR';

// 환경변수 안전 읽기 (process.env → Constants 순서로 확인)
const getMapsKey = (): string =>
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  '';

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);

  const [hasPerm, setHasPerm] = useState(false);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [destText, setDestText] = useState('');
  const [destPos, setDestPos] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);

  // (안드로이드) 내장 지오코더에 구글키 보강
  useEffect(() => {
    if (Platform.OS === 'android') {
      const key = getMapsKey();
      const maybe = Location as any;
      if (key && typeof maybe?.setGoogleApiKey === 'function') {
        maybe.setGoogleApiKey(key);
      }
    }
  }, []);

  // 권한 + 현재 위치 추적
  useEffect(() => {
    let sub: { remove: () => void } | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('위치 권한이 필요합니다.');
        setHasPerm(false);
        return;
      }
      setHasPerm(true);

      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const pos = { latitude: cur.coords.latitude, longitude: cur.coords.longitude };
      setMyPos(pos);
      if (mapReadyRef.current) {
        mapRef.current?.animateToRegion({ ...pos, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
      }

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 5 },
        (loc) => setMyPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      );
    })();

    return () => sub && sub.remove();
  }, []);

  // 주소 → 좌표 (기기 지오코더 → 실패 시 Google Geocoding)
  const geocode = async () => {
    const q = destText.trim();
    if (!q) return Alert.alert('알림', '목적지 주소를 입력하세요.');
    Keyboard.dismiss();
    setError(null);

    try {
      const r = await Location.geocodeAsync(q);
      if (Array.isArray(r) && r.length) {
        const target = { latitude: r[0].latitude, longitude: r[0].longitude };
        setDestPos(target);
        if (mapReadyRef.current) {
          mapRef.current?.animateToRegion({ ...target, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
        }
        return;
      }
    } catch {
      // 기기 지오코더 실패 시 폴백
    }

    try {
      const key = getMapsKey();
      if (!key) throw new Error('Google API Key가 없습니다 (.env / app.config.ts 확인).');

      const url =
        `https://maps.googleapis.com/maps/api/geocode/json` +
        `?address=${encodeURIComponent(q)}` +
        (COUNTRY_BIAS ? `&components=country:${COUNTRY_BIAS}` : '') +
        `&key=${key}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.status === 'OK' && data.results?.length) {
        const { lat, lng } = data.results[0].geometry.location;
        const target = { latitude: lat, longitude: lng };
        setDestPos(target);
        if (mapReadyRef.current) {
          mapRef.current?.animateToRegion({ ...target, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
        }
      } else {
        Alert.alert('주소를 찾을 수 없어요', `Geocoding status: ${data.status}`);
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '지오코딩 실패');
    }
  };

  // 외부 구글맵 길찾기 (음성안내 포함)
  const openExternalNav = () => {
    if (!destPos) return Alert.alert('알림', '먼저 목적지를 검색하세요.');
    const { latitude, longitude } = destPos;

    if (Platform.OS === 'ios') {
      const url = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
      Linking.openURL(url).catch(() =>
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`)
      );
    } else {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`);
    }
  };

  const initialRegion: Region = {
    latitude: myPos?.latitude ?? 37.5665,
    longitude: myPos?.longitude ?? 126.978,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Map (Google)</ThemedText>
      {error && <ThemedText type="defaultSemiBold" style={{ color: 'red' }}>{error}</ThemedText>}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="목적지 주소를 입력하세요 (예: 서울시청)"
          value={destText}
          onChangeText={setDestText}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={geocode}
        />
        <Button title="검색" onPress={geocode} />
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        provider={PROVIDER_GOOGLE}           // iOS/Android 모두 Google 타일
        showsUserLocation={hasPerm}
        showsMyLocationButton
        onMapReady={() => { mapReadyRef.current = true; }}
      >
        {destPos && <Marker coordinate={destPos} title="목적지" description={destText} />}
      </MapView>

      <View style={styles.footer}>
        <Button title="구글맵으로 길찾기" onPress={openExternalNav} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' },
  input: { flex: 1, height: 40, borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fff', marginRight: 8 },
  map: { flex: 1 },
  footer: { padding: 12, backgroundColor: 'transparent' },
});
