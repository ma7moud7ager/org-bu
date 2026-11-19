import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messageFor } from '@orgbu/shared';
import { OnboardingForm, type CatalogItem } from '@/components/onboarding-form';

const catalog: CatalogItem[] = [
  { id: 'f1', name_ar: 'الموارد البشرية', is_fixed: true },
  { id: 'v1', name_ar: 'التسويق', is_fixed: false },
];

async function fill(cr: string) {
  await userEvent.type(screen.getByLabelText('الاسم القانوني للشركة'), 'شركة تجربة');
  await userEvent.type(screen.getByLabelText('رقم السجل التجاري'), cr);
  await userEvent.type(screen.getByLabelText('عدد الموظفين'), '10');
  await userEvent.type(screen.getByLabelText('اسمك الكامل'), 'محمود مصطفى');
  await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'm@x.sa');
}

describe('OnboardingForm', () => {
  it('blocks an invalid commercial registration number', async () => {
    const action = vi.fn();
    render(<OnboardingForm catalog={catalog} action={action} />);
    await fill('123');
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الشركة' }));
    expect(screen.getByText(messageFor('ORG_VALIDATION'))).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
  it('shows fixed departments checked and disabled', () => {
    render(<OnboardingForm catalog={catalog} action={vi.fn()} />);
    const fixed = screen.getByLabelText(/الموارد البشرية/) as HTMLInputElement;
    expect(fixed.checked).toBe(true);
    expect(fixed.disabled).toBe(true);
  });
  it('shows the server error', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: messageFor('ORG_CR_TAKEN') });
    render(<OnboardingForm catalog={catalog} action={action} />);
    await fill('1010000001');
    await userEvent.click(screen.getByLabelText(/التسويق/));
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الشركة' }));
    expect(await screen.findByText(messageFor('ORG_CR_TAKEN'))).toBeInTheDocument();
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ cr_number: '1010000001', activity_type: 'commercial', catalog_ids: ['v1'] }));
  });
});
