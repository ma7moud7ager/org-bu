import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { identityFieldsFor } from '@/lib/identity-form';
import { ProfileForm } from '@/components/profile-form';

describe('identityFieldsFor', () => {
  it('Saudi uses national id only', () => {
    expect(identityFieldsFor('SA', null)).toEqual({ types: ['national_id'], showIqamaExpiry: false, showEntryDate: false, numberLabel: 'رقم الهوية الوطنية' });
  });
  it('non-Saudi iqama shows expiry', () => {
    const f = identityFieldsFor('EG', 'iqama');
    expect(f.types).toEqual(['iqama', 'border_number']);
    expect(f.showIqamaExpiry).toBe(true);
    expect(f.numberLabel).toBe('رقم الإقامة');
  });
  it('border number shows entry date', () => {
    const f = identityFieldsFor('EG', 'border_number');
    expect(f.showEntryDate).toBe(true);
    expect(f.numberLabel).toBe('رقم الحدود');
  });
});

describe('ProfileForm', () => {
  it('Saudi with an iqama-style number is rejected before submit', async () => {
    const action = vi.fn();
    render(<ProfileForm action={action} />);
    await userEvent.type(screen.getByLabelText('الاسم الكامل'), 'محمد أحمد');
    await userEvent.type(screen.getByLabelText('تاريخ الميلاد'), '1990-01-01');
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'm@x.sa');
    await userEvent.type(screen.getByLabelText('رقم الهوية الوطنية'), '2123456789');
    await userEvent.click(screen.getByRole('button', { name: 'إتمام التسجيل' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
