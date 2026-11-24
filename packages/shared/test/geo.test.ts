import { describe, it, expect } from 'vitest';
import { haversineMeters, parseMapsLink } from '../src/geo';

describe('haversineMeters', () => {
  it('Riyadh to Jeddah is about 845 km', () => {
    const d = haversineMeters({ lat: 24.7136, lng: 46.6753 }, { lat: 21.4858, lng: 39.1925 });
    expect(Math.abs(d - 845_000)).toBeLessThan(5_000);
  });
  it('same point is 0', () => expect(haversineMeters({ lat: 24.7, lng: 46.6 }, { lat: 24.7, lng: 46.6 })).toBe(0));
  it('~111 m per 0.001 degree latitude', () => {
    const d = haversineMeters({ lat: 24.7, lng: 46.6 }, { lat: 24.701, lng: 46.6 });
    expect(Math.round(d)).toBe(111);
  });
});

describe('parseMapsLink', () => {
  it('reads @lat,lng links', () =>
    expect(parseMapsLink('https://www.google.com/maps/place/x/@24.7136,46.6753,17z')).toEqual({ lat: 24.7136, lng: 46.6753 }));
  it('reads ?q= and ll= links', () => {
    expect(parseMapsLink('https://maps.google.com/?q=24.5,46.25')).toEqual({ lat: 24.5, lng: 46.25 });
    expect(parseMapsLink('https://maps.google.com/?ll=-1.5,30.1&z=3')).toEqual({ lat: -1.5, lng: 30.1 });
  });
  it('reads plain coordinates', () => expect(parseMapsLink(' 24.71, 46.67 ')).toEqual({ lat: 24.71, lng: 46.67 }));
  it('rejects garbage and out-of-range values', () => {
    expect(parseMapsLink('hello')).toBeNull();
    expect(parseMapsLink('95, 46')).toBeNull();
    expect(parseMapsLink('24, 190')).toBeNull();
  });
});
