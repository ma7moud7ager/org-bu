import { z } from 'zod';

export const NATIONAL_ID_PATTERN = /^1\d{9}$/;
export const IQAMA_PATTERN = /^2\d{9}$/;
/** Confirm against real samples before launch. */
export const BORDER_NUMBER_PATTERN = /^\d{10}$/;

export function normalizeSaudiPhone(input: string): string | null {
  let d = input.replace(/[\s\-()]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('966')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? `+966${d}` : null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const identitySchema = z
  .object({
    nationality: z.string().regex(/^[A-Z]{2}$/),
    identity_type: z.enum(['national_id', 'iqama', 'border_number']),
    identity_number: z.string(),
    iqama_expiry: isoDate.optional(),
    entry_date: isoDate.optional(),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string, path: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
    if (v.nationality === 'SA') {
      if (v.identity_type !== 'national_id') fail('saudi_requires_national_id', 'identity_type');
      else if (!NATIONAL_ID_PATTERN.test(v.identity_number)) fail('invalid_national_id', 'identity_number');
      return;
    }
    if (v.identity_type === 'national_id') return fail('non_saudi_cannot_use_national_id', 'identity_type');
    if (v.identity_type === 'iqama') {
      if (!IQAMA_PATTERN.test(v.identity_number)) fail('invalid_iqama', 'identity_number');
      if (!v.iqama_expiry) fail('iqama_expiry_required', 'iqama_expiry');
    } else {
      if (!BORDER_NUMBER_PATTERN.test(v.identity_number)) fail('invalid_border_number', 'identity_number');
      if (!v.entry_date) fail('entry_date_required', 'entry_date');
    }
  });

export const companyRegistrationSchema = z.object({
  legal_name: z.string().trim().min(2).max(200),
  cr_number: z.string().regex(/^\d{10}$/),
  employee_count: z.number().int().min(1).max(100000),
  activity_type: z.enum(['commercial', 'service', 'mixed']),
});
export type CompanyRegistration = z.infer<typeof companyRegistrationSchema>;

function ageOn(birth: string, today = new Date()): number {
  const b = new Date(birth + 'T00:00:00Z');
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const m = today.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export const employeeProfileSchema = z
  .object({
    full_name: z.string().trim().min(3).max(120),
    birth_date: isoDate.refine((d) => {
      const a = ageOn(d);
      return a >= 15 && a <= 80;
    }, 'invalid_age'),
    gender: z.enum(['male', 'female']),
    phone: z.string().transform((p, ctx) => {
      const n = normalizeSaudiPhone(p);
      if (!n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_phone' });
        return z.NEVER;
      }
      return n;
    }),
    email: z.string().trim().toLowerCase().email(),
  })
  .and(identitySchema);
export type EmployeeProfile = z.infer<typeof employeeProfileSchema>;
