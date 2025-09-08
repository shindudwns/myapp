// app/(tabs)/hud.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HUD_SNAPSHOT_KEY = 'HUD_NOW';

/** 화면을 가로 HUD처럼 보기 위한 회전 각도
 *  - 일반적으로 '90deg' 또는 '-90deg' 중 하나를 쓰면 됨.
 *  - 세로(회전 없음)로 보고 싶으면 '0deg'
 */
const ROTATE: '0deg' | '90deg' | '-90deg' = '90deg';

/** 앞유리 반사용이면 true → 좌우 반전 */
const MIRROR = false;

type HudTurn = { glyph?: string; label: string; distanceText: string; road?: string | null };
type HudSnapshot = {
  primary: HudTurn | null;
  secondary: HudTurn | null;
  limitMph: number | null;
  updatedAt: number;
};

const toMph = (ms?: number | null) => (ms == null ? 0 : Math.max(0, ms) * 2.23693629);

/* ───────── UI ───────── */

function PrimaryTurn({ d }: { d: HudTurn }) {
  const glyph = d.glyph ?? '↑';
  return (
    <View style={styles.primaryCard}>
      <View style={styles.primaryIcon}>
        <ThemedText style={styles.primaryGlyph}>{glyph}</ThemedText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText numberOfLines={1} style={styles.primaryTitle}>
          {d.label} · {d.distanceText}
        </ThemedText>
        {d.road ? (
          <ThemedText numberOfLines={1} style={styles.primaryRoad}>
            {d.road}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function SecondaryTurn({ d }: { d: HudTurn }) {
  const glyph = d.glyph ?? '↑';
  return (
    <View style={styles.secondaryStrip}>
      <ThemedText style={styles.secondaryGlyph}>{glyph}</ThemedText>
      <ThemedText numberOfLines={1} style={styles.secondaryText}>
        {d.label} · {d.distanceText}
        {d.road ? ` · ${d.road}` : ''}
      </ThemedText>
    </View>
  );
}

function SpeedRow({ limitMph, mph }: { limitMph?: number | null; mph: number }) {
  const lim = limitMph != null ? Math.round(limitMph) : null;
  const over = lim != null && mph > lim + 3;

  return (
    <View style={styles.speedRow}>
      <View style={[styles.speedSign, over && { borderColor: '#ff2d2d' }]}>
        <View style={styles.speedSignInner}>
          <ThemedText numberOfLines={1} style={styles.speedNum}>
            {lim ?? '--'}
          </ThemedText>
          <ThemedText numberOfLines={1} style={styles.speedUnit}>
            mph
          </ThemedText>
        </View>
      </View>
      <View style={[styles.mySpeed, over && { backgroundColor: '#ff2d2d' }]}>
        <ThemedText numberOfLines={1} style={styles.mySpeedText}>
          {Math.round(mph)} mph
        </ThemedText>
      </View>
    </View>
  );
}

/* ───────── Screen ───────── */

export default function HUDScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // 90° 회전 여부
  const isQuarterTurn = ROTATE === '90deg' || ROTATE === '-90deg';

  // 회전 각도에 따라 캔버스의 가로/세로를 바꿔 잡는다.
  // - 90/-90이면 화면의 "단축"이 가로(HUD폭), "장축"이 세로(HUD높이)가 됨
  // - 0deg면 일반 그대로
  const canvasWidth = isQuarterTurn ? height : width;
  const canvasHeight = isQuarterTurn ? width : height;

  // iPhone 13 Pro 기준으로 무난한 비율
  const gap = 12;
  const speedPanelWidth = Math.min(240, canvasWidth * 0.28);

  // 내 속도
  const [mph, setMph] = useState(0);
  useEffect(() => {
    let sub: any;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMph(toMph(cur.coords.speed ?? 0));
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1200, distanceInterval: 5 },
        (loc) => setMph(toMph(loc.coords.speed ?? 0))
      );
    })();
    return () => sub?.remove?.();
  }, []);

  // Map 탭에서 넘어오는 스냅샷(0.5초 폴링)
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const raw = await AsyncStorage.getItem(HUD_SNAPSHOT_KEY);
        if (raw) setSnap(JSON.parse(raw) as HudSnapshot);
      } catch {}
    }, 500);
    return () => clearInterval(t);
  }, []);

  // 회전 상태에서 안전영역 맵핑 (노치/홈인디케이터 보호)
  const padLeft   = isQuarterTurn ? insets.top    : insets.left;
  const padRight  = isQuarterTurn ? insets.bottom : insets.right;
  const padTop    = isQuarterTurn ? insets.left   : insets.top;
  const padBottom = isQuarterTurn ? insets.right  : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
        <View
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: [{ rotate: ROTATE }, ...(MIRROR ? [{ scaleX: -1 }] : [])],
          }}
        >
          <ThemedView
            style={[
              styles.inner,
              {
                paddingLeft: padLeft + 10,
                paddingRight: padRight + 10,
                paddingTop: padTop + 8,
                paddingBottom: padBottom + 12,
                gap,
              },
            ]}
          >
            {/* 좌측: 카드(유연) */}
            <View style={{ flexGrow: 1, flexBasis: 0 }}>
              <View style={styles.cardGroup}>
                {snap?.primary ? (
                  <>
                    <PrimaryTurn d={snap.primary} />
                    {snap.secondary && <SecondaryTurn d={snap.secondary} />}
                  </>
                ) : (
                  <View style={[styles.primaryCard, { justifyContent: 'center' }]}>
                    <ThemedText numberOfLines={1} style={styles.waitText}>
                      Map 탭에서 경로를 시작하세요
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>

            {/* 우측: 속도 패널(고정 폭) */}
            <View style={{ width: speedPanelWidth, justifyContent: 'center', alignItems: 'center' }}>
              <SpeedRow limitMph={snap?.limitMph ?? null} mph={mph} />
            </View>
          </ThemedView>
        </View>
      </View>
    </View>
  );
}

/* ───────── styles ───────── */
const GREEN = '#1d7f3d';
const GREEN_DARK = '#11592a';
const GREEN_LIGHT = '#2da85a';

const styles = StyleSheet.create({
  inner: { flex: 1, flexDirection: 'row', backgroundColor: '#000' },

  cardGroup: { backgroundColor: 'rgba(255,255,255,0.06)', padding: 10, borderRadius: 22 },

  primaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    minHeight: 100,
  },
  primaryIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  primaryGlyph: { color: '#fff', fontSize: 32, fontWeight: '900' },
  primaryTitle: { color: '#fff', fontSize: 28, fontWeight: '900' },
  primaryRoad: { color: '#e6ffe9', fontSize: 15, marginTop: 2 },

  secondaryStrip: {
    marginTop: 8,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GREEN_DARK,
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  secondaryGlyph: { color: '#c7ffcf', fontSize: 18, fontWeight: '900', marginRight: 8 },
  secondaryText: { color: '#c7ffcf', fontSize: 16, fontWeight: '800', flexShrink: 1, minWidth: 0 },

  waitText: { color: '#e9ffe9', fontWeight: '700', textAlign: 'center' },

  speedRow: { alignItems: 'center', gap: 10 },
  speedSign: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 10, borderColor: '#e63939',
  },
  speedSignInner: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  speedNum: { fontSize: 36, fontWeight: '900', color: '#111' },
  speedUnit: { fontSize: 12, fontWeight: '800', color: '#444' },
  mySpeed: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  mySpeedText: { color: '#fff', fontWeight: '900', fontSize: 20 },
});
