import { describe, it, expect } from 'vitest';
import { routeFor, type SessionState } from '@/lib/routing';
import { toLatinDigits } from '@/lib/phone';
import { normalizeSaudiPhone } from '@orgbu/shared';

const anon: SessionState = { userId: null, hasEmployee: false, isPlatformAdmin: false, isTerminated: false };
const fresh: SessionState = { userId: 'u', hasEmployee: false, isPlatformAdmin: false, isTerminated: false };
const member: SessionState = { userId: 'u', hasEmployee: true, isPlatformAdmin: false, isTerminated: false };
const owner: SessionState = { userId: 'u', hasEmployee: false, isPlatformAdmin: true, isTerminated: false };
const ended: SessionState = { userId: 'u', hasEmployee: false, isPlatformAdmin: false, isTerminated: true };

describe('routeFor', () => {
  it('public paths are open', () => {
    expect(routeFor('/login', anon)).toBeNull();
    expect(routeFor('/invite/abc', anon)).toBeNull();
  });
  it('anonymous users go to login with next', () => {
    expect(routeFor('/app/structure', anon)).toBe('/login?next=%2Fapp%2Fstructure');
  });
  it('authenticated without employee goes to onboarding', () => {
    expect(routeFor('/app/structure', fresh)).toBe('/onboarding');
    expect(routeFor('/onboarding', fresh)).toBeNull();
  });
  it('admin area is for platform admins only', () => {
    expect(routeFor('/admin/companies', member)).toBe('/app');
    expect(routeFor('/admin/companies', owner)).toBeNull();
  });
  it('members are sent away from onboarding and login', () => {
    expect(routeFor('/onboarding', member)).toBe('/app');
    expect(routeFor('/login', member)).toBe('/app');
  });
  it('root sends owners to admin and members to app', () => {
    expect(routeFor('/', owner)).toBe('/admin/companies');
    expect(routeFor('/', member)).toBe('/app');
  });
  it('owner without employee may open onboarding? no — goes to admin from app paths', () => {
    expect(routeFor('/app', owner)).toBe('/admin/companies');
  });
});

describe('terminated users', () => {
  it('go to /ended, never onboarding', () => {
    expect(routeFor('/app', ended)).toBe('/ended');
    expect(routeFor('/onboarding', ended)).toBe('/ended');
    expect(routeFor('/login', ended)).toBe('/ended');
    expect(routeFor('/', ended)).toBe('/ended');
    expect(routeFor('/ended', ended)).toBeNull();
  });
  it('/ended is not for others', () => {
    expect(routeFor('/ended', member)).toBe('/app');
    expect(routeFor('/ended', fresh)).toBe('/onboarding');
    expect(routeFor('/ended', anon)).toBe('/login?next=%2Fended');
  });
});

describe('phone digits', () => {
  it('arabic digits are accepted and normalized', () => {
    expect(normalizeSaudiPhone(toLatinDigits('٠٥٥١٢٣٤٥٦٧'))).toBe('+966551234567');
    expect(toLatinDigits('۰۵۵')).toBe('055');
  });
});
