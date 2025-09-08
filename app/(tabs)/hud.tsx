// app/(tabs)/hud.tsx
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HUD_SNAPSHOT_KEY = 'HUD_NOW';

/** 가로 HUD 회전 각도: '90deg' | '-90deg' | '0deg' */
const ROTATE: '0deg' | '90deg' | '-90deg' = '90deg';
/** 앞유리 반사용 */
const MIRROR = false;

/** 텍스트가 카드/경계에 닿아 잘리는 걸 방지하기 위한 여유 패딩(px) */
const TEXT_BLEED = 4;

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
        {/* 글리프가 살짝 잘리는 문제를 방지하기 위해 폰트크기↓ + lineHeight↑ + 위아래 여유 */}
        <ThemedText style={styles.primaryGlyph}>{glyph}</ThemedText>
      </View>
      {/* bleed 패딩으로 가장자리 클리핑 방지 + minWidth:0 로 줄바꿈 제어 */}
      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: TEXT_BLEED }}>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.92}
          style={styles.primaryTitle}
        >
          {d.label} · {d.distanceText}
        </ThemedText>
        {d.road ? (
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.92}
            style={styles.primaryRoad}
          >
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
      <ThemedText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.92}
        style={styles.secondaryText}
      >
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

  const isQuarterTurn = ROTATE === '90deg' || ROTATE === '-90deg';
  const canvasWidth = isQuarterTurn ? height : width;
  const canvasHeight = isQuarterTurn ? width : height;

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

  // 회전 시 안전영역 맵핑
  const padLeft = isQuarterTurn ? insets.top : insets.left;
  const padRight = isQuarterTurn ? insets.bottom : insets.right;
  const padTop = isQuarterTurn ? insets.left : insets.top;
  const padBottom = isQuarterTurn ? insets.right : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
        <View
          style={{
            width: canvasWidth,
            height: canvasHeight,
            // 바운딩 경계에서 여유를 줘서 경계 클리핑 예방
            padding: 2,
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
            {/* 좌측: 카드 */}
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

            {/* 우측: 속도 패널 */}
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

  // overflow: 'visible' 로 텍스트/둥근모서리 경계 클리핑 방지
  cardGroup: { backgroundColor: 'rgba(255,255,255,0.06)', padding: 10, borderRadius: 22, overflow: 'visible' },

  primaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    minHeight: 100,
    overflow: 'visible',
  },

  // ⬇︎ 아이콘을 조금 더 크게(여유있게) + 내부 패딩으로 글리프가 절대 닿지 않게
  primaryIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: GREEN_LIGHT,
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 2, paddingBottom: 2, // 위·아래 여유
    paddingLeft: 2, paddingRight: 2,  // 좌·우 여유
    marginRight: 12,
  },
  // 폰트크기 살짝↓, lineHeight 살짝↑ → iOS 글리프 클리핑 방지
  primaryGlyph: { color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '900' },

  primaryTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 0.2, lineHeight: 34 },
  primaryRoad:  { color: '#e6ffe9', fontSize: 15, marginTop: 2, lineHeight: 18 },

  secondaryStrip: {
    marginTop: 8,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GREEN_DARK,
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
    overflow: 'visible',
  },
  secondaryGlyph: { color: '#c7ffcf', fontSize: 18, fontWeight: '900', marginRight: 8, lineHeight: 20 },
  secondaryText:  { color: '#c7ffcf', fontSize: 16, fontWeight: '800', flexShrink: 1, minWidth: 0, lineHeight: 19 },

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
  speedNum:   { fontSize: 36, fontWeight: '900', color: '#111' },
  speedUnit:  { fontSize: 12, fontWeight: '800', color: '#444' },
  mySpeed:    { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  mySpeedText:{ color: '#fff', fontWeight: '900', fontSize: 20 },
});
