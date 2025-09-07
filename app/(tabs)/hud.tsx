import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

type Vec3 = { x: number; y: number; z: number };

export default function HUDScreen() {
  const [accel, setAccel] = useState<Vec3 | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let locSub: { remove: () => void } | null = null;

    Accelerometer.setUpdateInterval(300);
    const accelSub = Accelerometer.addListener((d) => setAccel({ x: d.x, y: d.y, z: d.z }));

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError('위치 권한이 필요합니다.'); return; }
      locSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 1, timeInterval: 1000 },
        (loc) => {
          setSpeed(loc.coords.speed ?? null);
          setHeading(loc.coords.heading ?? null);
        }
      );
    })();

    return () => { accelSub && accelSub.remove(); locSub && locSub.remove(); };
  }, []);

  const kmh = speed != null && speed >= 0 ? (speed * 3.6).toFixed(1) : '-';
  const hdg = heading != null && heading >= 0 ? Math.round(heading) : '-';
  const ax = accel ? accel.x.toFixed(2) : '-';
  const ay = accel ? accel.y.toFixed(2) : '-';
  const az = accel ? accel.z.toFixed(2) : '-';

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>HUD</ThemedText>
      {error && <ThemedText type="defaultSemiBold">{error}</ThemedText>}

      <ThemedView style={styles.row}>
        <Card label="속도 (km/h)" value={kmh} big />
        <Card label="방위 (°)" value={String(hdg)} big />
      </ThemedView>

      <ThemedView style={styles.row}>
        <Card label="Accel X" value={String(ax)} />
        <Card label="Accel Y" value={String(ay)} />
        <Card label="Accel Z" value={String(az)} />
      </ThemedView>

      <ThemedText style={{ opacity: 0.6, marginTop: 8 }}>
        팁: 실제 이동 중에 속도/방위가 업데이트됩니다.
      </ThemedText>
    </ThemedView>
  );
}

function Card({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <ThemedView style={[styles.card, big ? styles.cardBig : undefined]}>
      <ThemedText style={styles.cardLabel}>{label}</ThemedText>
      <ThemedText type="title" style={[styles.cardValue, big ? styles.cardValueBig : undefined]}>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, alignItems: 'center' },
  title: { marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12 },
  card: { padding: 14, borderRadius: 12, minWidth: 110, alignItems: 'center', gap: 6 },
  cardBig: { minWidth: 150 },
  cardLabel: { opacity: 0.7 },
  cardValue: { fontSize: 22 },
  cardValueBig: { fontSize: 32 },
});
