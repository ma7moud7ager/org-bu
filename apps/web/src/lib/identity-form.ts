export type IdentityType = 'national_id' | 'iqama' | 'border_number';

export function identityFieldsFor(nationality: string, identityType: 'iqama' | 'border_number' | null) {
  if (nationality === 'SA') {
    return { types: ['national_id'] as IdentityType[], showIqamaExpiry: false, showEntryDate: false, numberLabel: 'رقم الهوية الوطنية' };
  }
  const border = identityType === 'border_number';
  return {
    types: ['iqama', 'border_number'] as IdentityType[],
    showIqamaExpiry: !border,
    showEntryDate: border,
    numberLabel: border ? 'رقم الحدود' : 'رقم الإقامة',
  };
}

export const NATIONALITIES: Array<{ code: string; name: string }> = [
  { code: 'SA', name: 'السعودية' }, { code: 'EG', name: 'مصر' }, { code: 'IN', name: 'الهند' }, { code: 'PK', name: 'باكستان' },
  { code: 'BD', name: 'بنغلاديش' }, { code: 'PH', name: 'الفلبين' }, { code: 'YE', name: 'اليمن' }, { code: 'SD', name: 'السودان' },
  { code: 'JO', name: 'الأردن' }, { code: 'SY', name: 'سوريا' }, { code: 'LB', name: 'لبنان' },
];
