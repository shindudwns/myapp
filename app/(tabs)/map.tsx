//app/(tabs)/map.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import AsyncStorage from '@react-native-async-storage/async-storage'; // ✅ HUD로 내비 정보 공유
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Keyboard, Linking, Platform, StyleSheet, TextInput, View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type LatLng = { latitude: number; longitude: number };

// 미국 기본
const COUNTRY_BIAS = 'US';

// 키
const getMapsKey = (): string =>
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  '';

// ── 유틸 ──────────────────────────────────────────────────────────────────────
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
function formatUSDistance(meters: number, precisionForMiles: number = 1): string {
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet)} ft`;
  const miles = meters / 1609.344;
  return `${miles.toFixed(precisionForMiles)} mi`;
}
function msToMph(ms?: number | null): number | null {
  if (ms == null) return null;
  return Math.max(0, ms) * 2.23693629;
}

// ── 타입/매핑 ────────────────────────────────────────────────────────────────
type DirStep = {
  end_location: { lat: number; lng: number };
  html_instructions: string;
  distance?: { text: string; value: number };
  maneuver?: string;
};
function maneuverInfo(m?: string): { glyph: string; label: string } {
  switch (m) {
    case 'turn-right': return { glyph: '↱', label: '우회전' };
    case 'turn-left': return { glyph: '↰', label: '좌회전' };
    case 'turn-slight-right': return { glyph: '➚', label: '약간 우' };
    case 'turn-slight-left': return { glyph: '➚', label: '약간 좌' };
    case 'turn-sharp-right': return { glyph: '⤴', label: '급우' };
    case 'turn-sharp-left': return { glyph: '⤴', label: '급좌' };
    case 'uturn-right':
    case 'uturn-left': return { glyph: '↩', label: '유턴' };
    case 'merge': return { glyph: '⇱', label: '합류' };
    case 'ramp-right': return { glyph: '↗', label: '우측 램프' };
    case 'ramp-left': return { glyph: '↖', label: '좌측 램프' };
    case 'fork-right': return { glyph: '⤳', label: '우측 분기' };
    case 'fork-left': return { glyph: '⤶', label: '좌측 분기' };
    case 'keep-right': return { glyph: '→', label: '우측 유지' };
    case 'keep-left': return { glyph: '←', label: '좌측 유지' };
    case 'straight': default: return { glyph: '↑', label: '직진' };
  }
}
function cleanInstruction(html: string): { plain: string; road?: string } {
  let plain = (html ?? '').replace(/<[^>]+>/g, '');
  plain = plain.replace(/\(.*?\)/g, '').trim();
  plain = plain.replace(/\bPass by .+$/i, '').trim();
  const onto = plain.match(/\bonto\s+(.+)$/i);
  const toward = plain.match(/\btoward\s+(.+)$/i);
  return { plain, road: onto?.[1] ?? toward?.[1] };
}

// ── UI 조각 ─────────────────────────────────────────────────────────────────
function PrimaryTurnCard({ titleGlyph, titleLabel, distanceText, road }:{
  titleGlyph: string; titleLabel: string; distanceText: string; road?: string | null;
}) {
  return (
    <View style={styles.primaryCard}>
      <View style={styles.primaryIconCircle}>
        <ThemedText style={styles.primaryIcon}>{titleGlyph}</ThemedText>
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.primaryTitle}>{titleLabel} · {distanceText}</ThemedText>
        {road ? <ThemedText style={styles.primaryRoad}>{road}</ThemedText> : null}
      </View>
    </View>
  );
}
function SecondaryTurnStrip({ glyph, label, distanceText, road }:{
  glyph: string; label: string; distanceText: string; road?: string | null;
}) {
  return (
    <View style={styles.secondaryStrip}>
      <ThemedText style={styles.secondaryGlyph}>{glyph}</ThemedText>
      <ThemedText style={styles.secondaryText}>
        {label} · {distanceText}{road ? ` · ${road}` : ''}
      </ThemedText>
    </View>
  );
}
function SpeedWidgets({ limitMph, currentMph }:{
  limitMph?: number | null; currentMph?: number | null;
}) {
  const lim = limitMph != null ? Math.round(limitMph) : null;
  const cur = currentMph != null ? Math.max(0, Math.round(currentMph)) : null;
  const over = lim != null && cur != null && cur > lim + 3;
  return (
    <View style={styles.speedRow}>
      <View style={[styles.speedSign, over && { borderColor: '#ff2d2d' }]}>
        <View style={styles.speedSignInner}>
          <ThemedText style={styles.speedNumber}>{lim ?? '--'}</ThemedText>
          <ThemedText style={styles.speedUnit}>mph</ThemedText>
        </View>
      </View>
      <View style={[styles.currentSpeedPill, over && { backgroundColor: '#ff2d2d' }]}>
        <ThemedText style={styles.currentSpeedText}>{cur ?? '--'} mph</ThemedText>
      </View>
    </View>
  );
}

// ── 메인 ────────────────────────────────────────────────────────────────────
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);

  const [hasPerm, setHasPerm] = useState(false);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [gpsSpeedMs, setGpsSpeedMs] = useState<number | null>(null);

  const [destText, setDestText] = useState('');
  const [destPos, setDestPos] = useState<LatLng | null>(null);

  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [distanceText, setDistanceText] = useState<string | null>(null);
  const [durationText, setDurationText] = useState<string | null>(null);

  const [steps, setSteps] = useState<DirStep[]>([]);
  const [stepIdx, setStepIdx] = useState<number>(0);

  const [hudPrimary, setHudPrimary] = useState<{ glyph: string; label: string; distance: string; road?: string | null } | null>(null);
  const [hudSecondary, setHudSecondary] = useState<{ glyph: string; label: string; distance: string; road?: string | null } | null>(null);

  const [speedLimitMph, setSpeedLimitMph] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugMsg, setDebugMsg] = useState<string>('');

  // Roads 재조회 타이머
  useEffect(() => {
    let timer: any;
    timer = setInterval(() => {
      if (myPos) fetchAndSetSpeedLimit(myPos);
    }, 10000); // 10초마다 재시도(정지여도)
    return () => clearInterval(timer);
  }, [myPos]);

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
      if (status !== 'granted') { setError('위치 권한이 필요합니다.'); setHasPerm(false); return; }
      setHasPerm(true);

      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const pos = { latitude: cur.coords.latitude, longitude: cur.coords.longitude };
      setMyPos(pos);
      setGpsSpeedMs(cur.coords.speed ?? null);

      // 처음에도 제한속도 시도
      await fetchAndSetSpeedLimit(pos);

      if (mapReadyRef.current) {
        mapRef.current?.animateToRegion({ ...pos, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
      }

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1500, distanceInterval: 5 },
        async (loc) => {
          const p = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setMyPos(p);
          setGpsSpeedMs(loc.coords.speed ?? null);
        }
      );
    })();
    return () => { sub && sub.remove(); };
  }, []);

  // HUD 계산
  useEffect(() => {
    if (!myPos || steps.length === 0) return;
    const i = Math.min(stepIdx, steps.length - 1);
    const s1 = steps[i];

    const end1: LatLng = { latitude: s1.end_location.lat, longitude: s1.end_location.lng };
    const remainToNext = haversineMeters(myPos, end1);
    setHudPrimary(makePrimaryPayload(s1, remainToNext));

    const s2 = steps[i + 1];
    if (s2) setHudSecondary(makeSecondaryPayload(s2, s2.distance?.value ?? 0));
    else setHudSecondary(null);

    const ARRIVE_THRESHOLD_M = 120;
    if (remainToNext <= ARRIVE_THRESHOLD_M) {
      if (i < steps.length - 1) setStepIdx(i + 1);
      else setHudSecondary(null);
    }
  }, [myPos, steps, stepIdx]);

  function makePrimaryPayload(step: DirStep, remainMetersFromNow: number) {
    const { road } = cleanInstruction(step.html_instructions);
    const m = maneuverInfo(step.maneuver);
    return { glyph: m.glyph, label: m.label, distance: formatUSDistance(remainMetersFromNow, 1), road };
  }
  function makeSecondaryPayload(step: DirStep, extraMetersAfterNext: number) {
    const { road } = cleanInstruction(step.html_instructions);
    const m = maneuverInfo(step.maneuver);
    return { glyph: m.glyph, label: m.label, distance: formatUSDistance(extraMetersAfterNext, 2), road };
  }

  // ── Roads API: 다점 NearestRoads → 실패 시 SnapToRoads 폴백 ────────────────
  const fetchSpeedLimitMph = async (pos: LatLng): Promise<{ mph: number | null; dbg: string }> => {
    const key = getMapsKey();
    if (!key) return { mph: null, dbg: 'no_key' };

    // 주변 9점(현재 + 8방향) 생성
    const mToDeg = 1 / 111320; // 위도 기준
    const d = 35 * mToDeg;
    const pts: LatLng[] = [
      pos,
      { latitude: pos.latitude + d, longitude: pos.longitude },
      { latitude: pos.latitude - d, longitude: pos.longitude },
      { latitude: pos.latitude, longitude: pos.longitude + d },
      { latitude: pos.latitude, longitude: pos.longitude - d },
      { latitude: pos.latitude + d, longitude: pos.longitude + d },
      { latitude: pos.latitude + d, longitude: pos.longitude - d },
      { latitude: pos.latitude - d, longitude: pos.longitude + d },
      { latitude: pos.latitude - d, longitude: pos.longitude - d },
    ];
    const ptsParam = pts.map(p => `${p.latitude},${p.longitude}`).join('|');

    // 1) NearestRoads
    try {
      const nrUrl = `https://roads.googleapis.com/v1/nearestRoads?points=${encodeURIComponent(ptsParam)}&key=${key}`;
      const nrRes = await fetch(nrUrl);
      const nrText = await nrRes.text();
      let nrJson: any = {};
      try { nrJson = JSON.parse(nrText); } catch {}
      const placeIds: string[] = Array.from(
        new Set((nrJson?.snappedPoints ?? []).map((s: any) => s.placeId).filter(Boolean))
      );
      if (placeIds.length > 0) {
        const limUrl = `https://roads.googleapis.com/v1/speedLimits?${placeIds.map(p => `placeId=${encodeURIComponent(p)}`).join('&')}&units=MPH&key=${key}`;
        const limRes = await fetch(limUrl);
        const limText = await limRes.text();
        let limJson: any = {};
        try { limJson = JSON.parse(limText); } catch {}
        const mph = limJson?.speedLimits?.[0]?.speedLimit;
        if (typeof mph === 'number') return { mph, dbg: `nearest_ok(${placeIds.length})` };
        // 계속 진행해 폴백
      } else {
        // fallthrough to snap
      }
    } catch (e: any) {
      // ignore → snapToRoads 폴백
    }

    // 2) SnapToRoads 폴백(다점)
    try {
      const snapUrl = `https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(ptsParam)}&key=${key}`;
      const snapRes = await fetch(snapUrl);
      const snapText = await snapRes.text();
      let snapJson: any = {};
      try { snapJson = JSON.parse(snapText); } catch {}
      const pids: string[] = Array.from(
        new Set((snapJson?.snappedPoints ?? []).map((s: any) => s.placeId).filter(Boolean))
      );
      if (pids.length === 0) return { mph: null, dbg: 'snap_empty' };

      const limUrl = `https://roads.googleapis.com/v1/speedLimits?${pids.map(p => `placeId=${encodeURIComponent(p)}`).join('&')}&units=MPH&key=${key}`;
      const limRes = await fetch(limUrl);
      const limText = await limRes.text();
      let limJson: any = {};
      try { limJson = JSON.parse(limText); } catch {}
      const mph = limJson?.speedLimits?.[0]?.speedLimit;
      if (typeof mph === 'number') return { mph, dbg: `snap_ok(${pids.length})` };
      return { mph: null, dbg: 'snap_no_limit' };
    } catch (e: any) {
      return { mph: null, dbg: `snap_err` };
    }
  };

  const fetchAndSetSpeedLimit = async (pos: LatLng) => {
    const { mph, dbg } = await fetchSpeedLimitMph(pos);
    setDebugMsg(prev => `limit=${mph ?? '--'} | ${dbg}`);
    if (mph != null) setSpeedLimitMph(mph);
  };

  // ── Geocoding/Directions ──────────────────────────────────────────────────
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

  // ✅ HUD로 공유 저장 함수
  const shareStepsToHUD = async (legSteps: DirStep[]) => {
    try {
      await AsyncStorage.setItem(
        'HUD_NAV_STATE',
        JSON.stringify({ steps: legSteps, updatedAt: Date.now() })
      );
      setDebugMsg(prev => `${prev} | hud:shared(${legSteps.length})`);
    } catch {
      setDebugMsg(prev => `${prev} | hud:share_fail`);
    }
  };

  const drawRoute = async (origin: LatLng, destination: LatLng) => {
    const key = getMapsKey();
    if (!key) throw new Error('Google API Key가 없습니다.');
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving&language=en&region=us&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();

    const legs0 = data.routes?.[0]?.legs?.[0];
    const stepsArr = legs0?.steps ?? [];
    setDebugMsg(prev => `status=${data.status}${data.error_message ? ` msg=${data.error_message}` : ''} steps=${stepsArr.length}`);
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

    // ✅ HUD 탭이 읽을 수 있도록 공유 저장
    await shareStepsToHUD(legSteps);

    await fetchAndSetSpeedLimit(origin);

    if (mapRef.current && points.length) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 80, bottom: 180, left: 40, right: 40 },
        animated: true,
      });
    }
  };

  // ── UI 이벤트 ─────────────────────────────────────────────────────────────
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
    latitude: myPos?.latitude ?? 37.7749,
    longitude: myPos?.longitude ?? -122.4194,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const clearRoute = async () => {
    setRouteCoords([]);
    setDistanceText(null);
    setDurationText(null);
    setSteps([]);
    setStepIdx(0);
    setHudPrimary(null);
    setHudSecondary(null);
    setSpeedLimitMph(null);
    setDebugMsg('');
    // ✅ HUD 공유 상태 정리
    try { await AsyncStorage.removeItem('HUD_NAV_STATE'); } catch {}
  };

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  const currentMph = msToMph(gpsSpeedMs);

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

      {/* 상단 블록: 현재 턴(큰 카드) + 바로 아래 '그다음 턴' 바 */}
      <View style={[styles.overlayTop, { top: (insets.top ?? 0) + 64 }]}>
        {hudPrimary && (
          <PrimaryTurnCard
            titleGlyph={hudPrimary.glyph}
            titleLabel={hudPrimary.label}
            distanceText={hudPrimary.distance}
            road={hudPrimary.road}
          />
        )}
        {hudSecondary && (
          <SecondaryTurnStrip
            glyph={hudSecondary.glyph}
            label={hudSecondary.label}
            distanceText={hudSecondary.distance}
            road={hudSecondary.road ?? undefined}
          />
        )}

        {/* 그 아래 줄: 제한속도 + 현재속도 */}
        <View style={styles.speedContainer}>
          <SpeedWidgets limitMph={speedLimitMph} currentMph={currentMph ?? null} />
        </View>
      </View>

      {/* 검색바 */}
      <View style={[styles.searchRow, { paddingTop: insets.top + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Enter destination in the US (e.g., 2300 College Ave)"
          value={destText}
          onChangeText={setDestText}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={onSearch}
        />
        <Button title="검색" onPress={onSearch} />
      </View>

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

// ── 스타일 ───────────────────────────────────────────────────────────────────
const GREEN = '#1d7f3d';
const GREEN_DARK = '#11592a';
const GREEN_LIGHT = '#2da85a';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  searchRow: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, zIndex: 50,
  },
  input: { flex: 1, height: 42, borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff' },

  overlayTop: {
    position: 'absolute', left: 12, right: 12, zIndex: 9999,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.18)', padding: 6,
  },

  primaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GREEN,
    borderTopLeftRadius: 14, borderTopRightRadius: 14,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  primaryIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  primaryIcon: { color: '#fff', fontSize: 22, fontWeight: '800' },
  primaryTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  primaryRoad: { color: '#e6ffe9', fontSize: 14, marginTop: 2, opacity: 0.95 },

  secondaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GREEN_DARK,
    paddingVertical: 8, paddingHorizontal: 12,
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
  },
  secondaryGlyph: { color: '#c7ffcf', fontSize: 16, fontWeight: '800', marginRight: 8 },
  secondaryText: { color: '#c7ffcf', fontSize: 15, fontWeight: '700' },

  // 제한속도 줄 (방향 블록 바로 아래)
  speedContainer: {
    paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4,
    alignItems: 'flex-end',
  },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speedSign: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#e63939',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  speedSignInner: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  speedNumber: { fontSize: 22, fontWeight: '900', color: '#111' },
  speedUnit: { fontSize: 11, fontWeight: '700', color: '#444' },
  currentSpeedPill: {
    minWidth: 74, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  currentSpeedText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12, gap: 8, backgroundColor: 'transparent', zIndex: 40,
  },
  info: { textAlign: 'center', opacity: 0.9 },
  buttons: { gap: 8 },
});
