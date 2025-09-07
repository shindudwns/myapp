import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Keyboard, Linking, Platform, StyleSheet, TextInput, View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type LatLng = { latitude: number; longitude: number };

// ✅ 미국 기본
const COUNTRY_BIAS = 'US';

// REST 키(Geocoding/Directions) 읽기
const getMapsKey = (): string =>
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  '';

/** Google encoded polyline decoder */
function decodePolyline(encoded: string): LatLng[] {
  let index = 0, lat = 0, lng = 0;
  const out: LatLng[] = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1); lat += dlat;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1); lng += dlng;
    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return out;
}

// 거리(m)
function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 미국식 거리 포맷
function formatUSDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet)} ft`;
  const miles = meters / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// 속도(m/s → mph, 음수 보정)
function formatUSSpeed(ms?: number | null): string {
  if (ms == null) return '-- mph';
  const mph = Math.max(0, ms) * 2.23693629;
  return `${Math.round(mph)} mph`;
}

// Directions Step
type DirStep = {
  end_location: { lat: number; lng: number };
  html_instructions: string;
  distance?: { text: string; value: number };
  maneuver?: string;
  // roundabout일 때 exit 번호가 instruction 안에 들어오므로 별도 필드는 없음
};

// maneuver → 아이콘/한국어 라벨 매핑
function maneuverInfo(m?: string): { icon: string; label: string } {
  switch (m) {
    case 'turn-right': return { icon: '➡️', label: '우회전' };
    case 'turn-left': return { icon: '⬅️', label: '좌회전' };
    case 'turn-slight-right': return { icon: '↗️', label: '약간 우회전' };
    case 'turn-slight-left': return { icon: '↖️', label: '약간 좌회전' };
    case 'turn-sharp-right': return { icon: '⤴️', label: '급우회전' };
    case 'turn-sharp-left': return { icon: '⤴️', label: '급좌회전' };
    case 'uturn-right':
    case 'uturn-left': return { icon: '↩️', label: '유턴' };
    case 'merge': return { icon: '🔀', label: '합류' };
    case 'ramp-right': return { icon: '↗️', label: '우측 램프' };
    case 'ramp-left': return { icon: '↖️', label: '좌측 램프' };
    case 'fork-right': return { icon: '➡️', label: '우측 분기' };
    case 'fork-left': return { icon: '⬅️', label: '좌측 분기' };
    case 'keep-right': return { icon: '➡️', label: '우측 유지' };
    case 'keep-left': return { icon: '⬅️', label: '좌측 유지' };
    case 'straight': return { icon: '⬆️', label: '직진' };
    // roundabout-* 는 아래에서 텍스트로 보완
    default: return { icon: '⬆️', label: '직진' };
  }
}

// html_instructions에서 간단한 도로명 추출 (onto/toward 뒤 꼬리표)
function extractRoadName(plain: string): string | null {
  const onto = plain.match(/\bonto\s+(.+)$/i);
  if (onto) return onto[1];
  const toward = plain.match(/\btoward\s+(.+)$/i);
  if (toward) return toward[1];
  return null;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);

  const [hasPerm, setHasPerm] = useState(false);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [gpsSpeed, setGpsSpeed] = useState<number | null>(null);

  const [destText, setDestText] = useState('');
  const [destPos, setDestPos] = useState<LatLng | null>(null);

  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [distanceText, setDistanceText] = useState<string | null>(null);
  const [durationText, setDurationText] = useState<string | null>(null);

  const [steps, setSteps] = useState<DirStep[]>([]);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [hudLine, setHudLine] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [debugMsg, setDebugMsg] = useState<string>('');

  // (안드) 지오코더 Key 보강
  useEffect(() => {
    if (Platform.OS === 'android') {
      const key = getMapsKey();
      const maybe = Location as any;
      if (key && typeof maybe?.setGoogleApiKey === 'function') maybe.setGoogleApiKey(key);
    }
  }, []);

  // 권한 + 위치 추적
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
      setGpsSpeed(cur.coords.speed ?? null);

      if (mapReadyRef.current) {
        mapRef.current?.animateToRegion({ ...pos, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
      }

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1500, distanceInterval: 5 },
        (loc) => {
          setMyPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          setGpsSpeed(loc.coords.speed ?? null);
        }
      );
    })();
    return () => { sub && sub.remove(); };
  }, []);

  // 현재 위치 변화 시 HUD/step 전환
  useEffect(() => {
    if (!myPos || steps.length === 0) return;
    const idx = Math.min(stepIdx, steps.length - 1);
    const step = steps[idx];
    if (!step) return;

    const end: LatLng = { latitude: step.end_location.lat, longitude: step.end_location.lng };
    const remain = haversineMeters(myPos, end);

    // 텍스트 생성
    const plain = (step.html_instructions ?? '').replace(/<[^>]+>/g, '');
    const rd = extractRoadName(plain);
    let label = '';
    if (step.maneuver && step.maneuver.startsWith('roundabout')) {
      // roundabout-right / roundabout-left – 안내문에 'Take the 2nd exit' 같은 문구 포함됨
      const exit = plain.match(/(\d+)(st|nd|rd|th)\s+exit/i)?.[1];
      label = `로터리 ${exit ? `${exit}번째 출구` : '통과'}`;
    } else {
      const { icon, label: ko } = maneuverInfo(step.maneuver);
      label = `${icon} ${ko}`;
    }
    const base = `${label} • ${formatUSDistance(remain)}`;
    setHudLine(rd ? `${base} · ${rd}` : base);

    // 접근 임계값
    const ARRIVE_THRESHOLD_M = 120;
    if (remain <= ARRIVE_THRESHOLD_M) {
      if (idx < steps.length - 1) setStepIdx(idx + 1);
      else setHudLine('목적지에 도착');
    }
  }, [myPos, steps, stepIdx]);

  /** Geocoding */
  const geocodeWithGoogle = async (query: string) => {
    const key = getMapsKey();
    if (!key) throw new Error('Google API Key가 없습니다.');
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(query)}` +
      (COUNTRY_BIAS ? `&components=country:${COUNTRY_BIAS}` : '') +
      `&language=en&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results?.length) {
      const { lat, lng } = data.results[0].geometry.location;
      return { latitude: lat, longitude: lng } as LatLng;
    }
    throw new Error(`Geocoding 실패: ${data.status} ${data.error_message ?? ''}`);
  };

  /** Directions */
  const drawRoute = async (origin: LatLng, destination: LatLng) => {
    const key = getMapsKey();
    if (!key) throw new Error('Google API Key가 없습니다.');
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving&language=en&region=us&key=${key}`; // 미국 기본
    const res = await fetch(url);
    const data = await res.json();

    const legs0 = data.routes?.[0]?.legs?.[0];
    const stepsArr = legs0?.steps ?? [];
    setDebugMsg(`status=${data.status}${data.error_message ? ` msg=${data.error_message}` : ''} steps=${stepsArr.length}`);
    if (data.status !== 'OK') throw new Error(`Directions 실패: ${data.status} ${data.error_message ?? ''}`);

    const route = data.routes[0];
    const points = decodePolyline(route.overview_polyline.points);
    setRouteCoords(points);
    setDistanceText(legs0?.distance?.text ?? null);
    setDurationText(legs0?.duration?.text ?? null);

    const legSteps: DirStep[] = stepsArr.map((s: any) => ({
      end_location: s.end_location,
      html_instructions: s.html_instructions,
      distance: s.distance,
      maneuver: s.maneuver,
    }));
    setSteps(legSteps);
    setStepIdx(0);

    // 첫 줄 HUD 미리 세팅
    if (legSteps.length > 0) {
      const first = legSteps[0];
      const plain = (first.html_instructions ?? '').replace(/<[^>]+>/g, '');
      const rd = extractRoadName(plain);
      let headline = '';
      if (first.maneuver && first.maneuver.startsWith('roundabout')) {
        const exit = plain.match(/(\d+)(st|nd|rd|th)\s+exit/i)?.[1];
        headline = `로터리 ${exit ? `${exit}번째 출구` : '통과'}`;
      } else {
        const { icon, label } = maneuverInfo(first.maneuver);
        headline = `${icon} ${label}`;
      }
      const approx = first.distance?.value ?? 0;
      const base = `${headline} • ${formatUSDistance(approx)}`;
      setHudLine(rd ? `${base} · ${rd}` : base);
    } else {
      setHudLine(null);
    }

    if (mapRef.current && points.length) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 80, bottom: 160, left: 40, right: 40 },
        animated: true,
      });
    }
  };

  const onSearch = async () => {
    const q = destText.trim();
    if (!q) return Alert.alert('알림', '목적지 주소를 입력하세요.');
    Keyboard.dismiss(); setError(null);
    try {
      const target = await geocodeWithGoogle(q);
      setDestPos(target);
      if (mapReadyRef.current) {
        mapRef.current?.animateToRegion({ ...target, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
      }
      if (myPos) await drawRoute(myPos, target);
      else Alert.alert('알림', '현재 위치를 가져오는 중입니다. 잠시 후 다시 시도해주세요.');
    } catch (e: any) {
      console.warn('geocode/directions error', e);
      setDebugMsg(`error=${e?.message ?? 'unknown'}`);
      Alert.alert('오류', e?.message ?? '검색 실패');
    }
  };

  const openExternalNav = async () => {
    if (!destPos) return Alert.alert('알림', '먼저 목적지를 검색하세요.');
    const { latitude, longitude } = destPos;
    const appUrl = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    const supported = await Linking.canOpenURL(appUrl);
    Linking.openURL(supported ? appUrl : webUrl);
  };

  const initialRegion: Region = {
    latitude: myPos?.latitude ?? 37.7749, // 샌프란시스코
    longitude: myPos?.longitude ?? -122.4194,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const clearRoute = () => {
    setRouteCoords([]);
    setDistanceText(null);
    setDurationText(null);
    setSteps([]);
    setStepIdx(0);
    setHudLine(null);
    setDebugMsg('');
  };

  return (
    <ThemedView style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={hasPerm}
        onMapReady={() => { mapReadyRef.current = true; }}
      >
        {destPos && <Marker coordinate={destPos} title="Destination" description={destText} />}
        {routeCoords.length > 1 && <Polyline coordinates={routeCoords} strokeWidth={5} />}
      </MapView>

      {/* 검색바 */}
      <View style={[styles.searchRow, { paddingTop: insets.top + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Enter destination in the US (e.g., Cook Out)"
          value={destText}
          onChangeText={setDestText}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={onSearch}
        />
        <Button title="검색" onPress={onSearch} />
      </View>

      {/* ✅ HUD (방향 아이콘+라벨) */}
      {hudLine && (
        <View
          pointerEvents="none"
          style={[styles.hudBox, { top: (insets.top ?? 0) + 64 }]}
        >
          <ThemedText style={styles.hudMain}>{hudLine}</ThemedText>
          <ThemedText style={styles.hudSub}>
            Speed {formatUSSpeed(gpsSpeed)}
          </ThemedText>
        </View>
      )}

      {/* 하단 정보/버튼/디버그 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {error && <ThemedText style={{ color: 'red', textAlign: 'center' }}>{error}</ThemedText>}
        {distanceText && durationText ? (
          <ThemedText style={styles.info}>{distanceText} · {durationText}</ThemedText>
        ) : null}
        {debugMsg ? (
          <ThemedText style={{ textAlign: 'center', opacity: 0.7 }}>{debugMsg}</ThemedText>
        ) : null}
        <View style={styles.buttons}>
          <Button title="구글맵으로 길찾기" onPress={openExternalNav} />
          {routeCoords.length > 0 && <Button title="경로 지우기" onPress={clearRoute} />}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchRow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    zIndex: 50,
  },
  input: {
    flex: 1, height: 42, borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff',
  },
  footer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12, gap: 8, backgroundColor: 'transparent',
    zIndex: 40,
  },
  info: { textAlign: 'center', opacity: 0.9 },
  buttons: { gap: 8 },

  // ✅ HUD
  hudBox: {
    position: 'absolute',
    left: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    zIndex: 9999,
  },
  hudMain: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  hudSub: {
    color: '#fff',
    opacity: 0.9,
    marginTop: 4,
    fontSize: 14,
  },
});
