export type LatLng = { lat: number; lng: number };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters (same formula as private.distance_m in SQL). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Coordinates from a Google Maps link (@lat,lng · q= · ll=) or a plain "lat, lng". */
export function parseMapsLink(input: string): LatLng | null {
  const s = input.trim();
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|ll|query)=${num},\\s*${num}`),
    new RegExp(`^${num}\\s*,\\s*${num}$`),
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      return valid(lat, lng) ? { lat, lng } : null;
    }
  }
  return null;
}
