import { describe, it, expect } from 'vitest';
import {
  normalizeSaudiPhone,
  identitySchema,
  companyRegistrationSchema,
  employeeProfileSchema,
} from '../src/validation';

const yearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

describe('normalizeSaudiPhone', () => {
  it.each(['0551234567', '551234567', '966551234567', '+966551234567', '+966 55 123 4567'])('normalizes %s', (p) => {
    expect(normalizeSaudiPhone(p)).toBe('+966551234567');
  });
  it.each(['0451234567', '12345'])('rejects %s', (p) => {
    expect(normalizeSaudiPhone(p)).toBeNull();
  });
});

describe('identitySchema', () => {
  it('rejects Saudi with iqama-style number', () => {
    expect(identitySchema.safeParse({ nationality: 'SA', identity_type: 'national_id', identity_number: '2123456789' }).success).toBe(false);
  });
  it('rejects Saudi using non-national identity type', () => {
    expect(identitySchema.safeParse({ nationality: 'SA', identity_type: 'iqama', identity_number: '2123456789', iqama_expiry: '2030-01-01' }).success).toBe(false);
  });
  it('accepts Saudi national id', () => {
    expect(identitySchema.safeParse({ nationality: 'SA', identity_type: 'national_id', identity_number: '1123456789' }).success).toBe(true);
  });
  it('rejects non-Saudi iqama without expiry', () => {
    expect(identitySchema.safeParse({ nationality: 'EG', identity_type: 'iqama', identity_number: '2123456789' }).success).toBe(false);
  });
  it('accepts border number with entry date', () => {
    expect(identitySchema.safeParse({ nationality: 'EG', identity_type: 'border_number', identity_number: '3012345678', entry_date: '2026-10-01' }).success).toBe(true);
  });
});

describe('companyRegistrationSchema', () => {
  it('rejects short cr_number', () => {
    expect(companyRegistrationSchema.safeParse({ legal_name: 'شركة', cr_number: '123', employee_count: 5, activity_type: 'service' }).success).toBe(false);
  });
  it('accepts valid company', () => {
    expect(companyRegistrationSchema.safeParse({ legal_name: 'شركة عالم رحال', cr_number: '1010123456', employee_count: 5, activity_type: 'commercial' }).success).toBe(true);
  });
});

describe('employeeProfileSchema', () => {
  const base = {
    full_name: 'محمود مصطفى',
    birth_date: yearsAgo(30),
    gender: 'male',
    phone: '0551234567',
    email: 'A@B.COM',
    nationality: 'EG',
    identity_type: 'iqama',
    identity_number: '2123456789',
    iqama_expiry: '2030-01-01',
  };
  it('normalizes phone and lowercases email', () => {
    const r = employeeProfileSchema.parse(base);
    expect(r.phone).toBe('+966551234567');
    expect(r.email).toBe('a@b.com');
  });
  it('rejects a 10-year-old', () => {
    expect(employeeProfileSchema.safeParse({ ...base, birth_date: yearsAgo(10) }).success).toBe(false);
  });
});
