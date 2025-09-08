/** app/(tabs)/hud.tsx */
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type LatLng = { latitude: number; longitude: number };
type DirStep = {
  end_location: { lat: number; lng: number };
  html_instructions: string;
  distance?: { text: string; value: number };
  maneuver?: string;
};

const getMapsKey = () =>
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  (require('expo-constants').default.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
  '';

/* ───────── utils ───────── */
function haversineMeters(a: LatLng, b: LatLng) {
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
function msToMph(ms?: number | null) { return ms == null ? 0 : Math.max(0, ms) * 2.23693629; }
function nf(x: number, d = 1) { return Number.isFinite(x) ? x.toFixed(d) : '--'; }
function formatUSDistance(meters: number, p = 1) {
  const ft = meters * 3.28084; if (ft < 1000) return `${Math.round(ft)} ft`;
  const mi = meters / 1609.344; return `${mi.toFixed(p)} mi`;
}
function cleanInstruction(html: string): { road?: string } {
  let s = (html ?? '').replace(/<[^>]+>/g, '');
  s = s.replace(/\(.*?\)/g, '').replace(/\bPass by .+$/i, '').trim();
  const onto = s.match(/\bonto\s+(.+)$/i); const toward = s.match(/\btoward\s+(.+)$/i);
  return { road: onto?.[1] ?? toward?.[1] };
}
function maneuverInfo(m?: string) {
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
    default: return { glyph: '↑', label: '직진' };
  }
}

/* ───────── UI atoms ───────── */
function PrimaryTurn({ glyph, distance, road }:{
  glyph: string; distance: string; road?: string | null;
}) {
  return (
    <View style={styles.primaryCard}>
      <View style={styles.primaryIcon}>
        <ThemedText style={styles.primaryGlyph}>{glyph}</ThemedText>
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.primaryTitle}>{distance}</ThemedText>
        {road ? <ThemedText style={styles.primaryRoad}>{road}</ThemedText> : null}
      </View>
    </View>
  );
}
function SecondaryTurn({ glyph, label, distance, road }:{
  glyph: string; label: string; distance: string; road?: string | null;
}) {
  return (
    <View style={styles.secondaryStrip}>
      <ThemedText style={styles.secondaryGlyph}>{glyph}</ThemedText>
      <ThemedText style={styles.secondaryText}>
        {label} · {distance}{road ? ` · ${road}` : ''}
      </ThemedText>
    </View>
  );
}
function SpeedRow({ limitMph, mph }:{ limitMph?: number | null; mph: number }) {
  const lim = limitMph != null ? Math.round(limitMph) : null;
  const over = lim != null && mph > lim + 3;
  return (
    <View style={styles.speedRow}>
      <View style={[styles.speedSign, over && { borderColor: '#ff2d2d' }]}>
        <View style={styles.speedSignInner}>
          <ThemedText style={styles.speedNum}>{lim ?? '--'}</ThemedText>
          <ThemedText style={styles.speedUnit}>mph</ThemedText>
        </View>
      </View>
      <View style={[styles.mySpeed, over && { backgroundColor: '#ff2d2d' }]}>
        <ThemedText style={styles.mySpeedText}>{Math.round(mph)} mph</ThemedText>
      </View>
    </View>
  );
}

/* ───────── Component ───────── */
export default function HUDScreen() {
  const insets = useSafeAreaInsets();
  const [pos, setPos] = useState<LatLng | null>(null);
  const [speedMs, setSpeedMs] = useState<number | null>(null);

  const [steps, setSteps] = useState<DirStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);

  const [primary, setPrimary] = useState<{ glyph: string; distance: string; road?: string | null } | null>(null);
  const [secondary, setSecondary] = useState<{ glyph: string; label: string; distance: string; road?: string | null } | null>(null);

  const [speedLimitMph, setSpeedLimitMph] = useState<number | null>(null);
  const lastLimitAtRef = useRef(0);
  const [debug, setDebug] = useState('');

  // 화면 크기에 맞춰 폰트/카드 자동 스케일
  const { width } = Dimensions.get('window');
  const scale = Math.min(1.25, Math.max(0.9, width / 390)); // iPhone 14 기준 390

  // 위치 권한/추적
  useEffect(() => {
    let sub: any;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setDebug('위치 권한 필요'); return; }
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPos({ latitude: cur.coords.latitude, longitude: cur.coords.longitude });
      setSpeedMs(cur.coords.speed ?? null);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1200, distanceInterval: 5 },
        (loc) => { setPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }); setSpeedMs(loc.coords.speed ?? null); }
      );
    })();
    return () => sub?.remove?.();
  }, []);

  // Map 탭 → AsyncStorage 폴링
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const s = await AsyncStorage.getItem('HUD_NAV_STATE');
        if (!s) return;
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed?.steps)) setSteps(parsed.steps);
      } catch {}
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // 다음/다다음 턴 계산
  useEffect(() => {
    if (!pos || steps.length === 0) { setPrimary(null); setSecondary(null); return; }
    let i = Math.min(stepIdx, steps.length - 1);

    const distToStep = (k: number) => {
      const e = steps[k].end_location;
      return haversineMeters(pos, { latitude: e.lat, longitude: e.lng });
    };

    let bestI = i, bestD = distToStep(i);
    for (let k = Math.max(0, i - 2); k <= Math.min(steps.length - 1, i + 3); k++) {
      const d = distToStep(k); if (d < bestD) { bestD = d; bestI = k; }
    }
    i = bestI;
    if (i !== stepIdx) setStepIdx(i);

    const s1 = steps[i]; const m1 = maneuverInfo(s1.maneuver);
    setPrimary({ glyph: m1.glyph, distance: formatUSDistance(bestD, 1), road: cleanInstruction(s1.html_instructions).road });

    const s2 = steps[i + 1];
    if (s2) {
      const m2 = maneuverInfo(s2.maneuver);
      setSecondary({ glyph: m2.glyph, label: m2.label, distance: formatUSDistance(s2.distance?.value ?? 0, 2), road: cleanInstruction(s2.html_instructions).road });
    } else setSecondary(null);

    if (bestD <= 120 && i < steps.length - 1) setStepIdx(i + 1);
  }, [pos, steps]);

  // 제한속도 10초 주기(정지여도 조회)
  useEffect(() => {
    const timer = setInterval(() => { if (pos) maybeFetchSpeedLimit(pos); }, 10000);
    return () => clearInterval(timer);
  }, [pos]);

  async function maybeFetchSpeedLimit(p: LatLng) {
    const now = Date.now();
    if (now - lastLimitAtRef.current < 8000) return;
    lastLimitAtRef.current = now;
    const { mph, dbg } = await fetchSpeedLimitMph(p);
    if (mph != null) setSpeedLimitMph(mph);
    setDebug(dbg);
  }

  // Roads API (Nearest → Snap 폴백)
  async function fetchSpeedLimitMph(pos: LatLng): Promise<{ mph: number | null; dbg: string }> {
    const key = getMapsKey(); if (!key) return { mph: null, dbg: 'no_key' };
    const mToDeg = 1 / 111320, d = 35 * mToDeg;
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
    try {
      const nr = await (await fetch(`https://roads.googleapis.com/v1/nearestRoads?points=${encodeURIComponent(ptsParam)}&key=${key}`)).json();
      const placeIds: string[] = Array.from(new Set((nr?.snappedPoints ?? []).map((s: any) => s.placeId).filter(Boolean)));
      if (placeIds.length) {
        const lim = await (await fetch(`https://roads.googleapis.com/v1/speedLimits?${placeIds.map(p => `placeId=${encodeURIComponent(p)}`).join('&')}&units=MPH&key=${key}`)).json();
        const mph = lim?.speedLimits?.[0]?.speedLimit; if (typeof mph === 'number') return { mph, dbg: `nearest_ok(${placeIds.length})` };
      }
    } catch {}
    try {
      const snap = await (await fetch(`https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(ptsParam)}&key=${key}`)).json();
      const pids: string[] = Array.from(new Set((snap?.snappedPoints ?? []).map((s: any) => s.placeId).filter(Boolean)));
      if (!pids.length) return { mph: null, dbg: 'snap_empty' };
      const lim = await (await fetch(`https://roads.googleapis.com/v1/speedLimits?${pids.map(p => `placeId=${encodeURIComponent(p)}`).join('&')}&units=MPH&key=${key}`)).json();
      const mph = lim?.speedLimits?.[0]?.speedLimit;
      return typeof mph === 'number' ? { mph, dbg: `snap_ok(${pids.length})` } : { mph: null, dbg: 'snap_no_limit' };
    } catch { return { mph: null, dbg: 'snap_err' }; }
  }

  const mph = msToMph(speedMs);

  return (
    <ThemedView style={styles.root}>
      {/* 세이프에어리어를 충분히 확보해서 잘림 방지 */}
      <View style={[styles.inner, {
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + 26,
        transform: [{ scale }],
      }]}>
        {/* 좌: 방향 카드(크게) */}
        <View style={styles.leftCol}>
          <View style={styles.cardGroup}>
            {primary ? (
              <>
                <PrimaryTurn glyph={primary.glyph} distance={primary.distance} road={primary.road} />
                {secondary && (
                  <SecondaryTurn
                    glyph={secondary.glyph}
                    label={secondary.label}
                    distance={secondary.distance}
                    road={secondary.road}
                  />
                )}
              </>
            ) : (
              <View style={[styles.primaryCard, { justifyContent: 'center' }]}>
                <ThemedText style={styles.waitText}>Map 탭에서 목적지를 선택하세요</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* 우: 제한속도 + 현재속도 */}
        <View style={styles.rightCol}>
          <SpeedRow limitMph={speedLimitMph} mph={mph} />
          <ThemedText style={styles.debug}>{debug}</ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

/* ───────── styles ───────── */
const GREEN = '#1d7f3d';
const GREEN_DARK = '#11592a';
const GREEN_LIGHT = '#2da85a';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' }, // HUD는 검은 배경
  inner: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 16,
  },

  leftCol: { flex: 2, justifyContent: 'center' },
  rightCol: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },

  cardGroup: { borderRadius: 22, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', padding: 10 },

  primaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GREEN,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    paddingVertical: 16, paddingHorizontal: 18,
  },
  primaryIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: GREEN_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  primaryGlyph: { color: '#fff', fontSize: 40, fontWeight: '900' },
  primaryTitle: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: 0.3 },
  primaryRoad: { color: '#e6ffe9', fontSize: 20, marginTop: 2 },

  secondaryStrip: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center',
    backgroundColor: GREEN_DARK, paddingVertical: 14, paddingHorizontal: 16,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  secondaryGlyph: { color: '#c7ffcf', fontSize: 24, fontWeight: '900', marginRight: 10 },
  secondaryText: { color: '#c7ffcf', fontSize: 20, fontWeight: '800' },

  waitText: { color: '#e9ffe9', fontSize: 22, fontWeight: '700', textAlign: 'center' },

  speedRow: { alignItems: 'center', gap: 12 },
  speedSign: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 10, borderColor: '#e63939',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  speedSignInner: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  speedNum: { fontSize: 42, fontWeight: '900', color: '#111' },
  speedUnit: { fontSize: 16, fontWeight: '800', color: '#444', marginTop: 2 },

  mySpeed: { minWidth: 150, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 18, alignItems: 'center' },
  mySpeedText: { color: '#fff', fontSize: 26, fontWeight: '900' },

  debug: { color: '#7af', opacity: 0.6, marginTop: 6, fontSize: 12 },
});
