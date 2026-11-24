import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/app/me/actions', () => ({ updateMyDocument: vi.fn() }));
import { DocumentCard } from '@/components/document-card';

const now = new Date('2026-11-24T09:00:00Z');

describe('DocumentCard', () => {
  it('shows a red countdown when the iqama expires in under 30 days', () => {
    render(<DocumentCard doc={{ identity_type: 'iqama', identity_last4: '4321', iqama_expiry: '2026-12-04', entry_date: null, nationality: 'EG' }} now={now} />);
    const badge = screen.getByText('باقي 10 يوم');
    expect(badge.className).toContain('red');
    expect(screen.getByText('••••••4321')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تحديث الإقامة' })).toBeTruthy();
  });
  it('shows an expired notice and hides the update button for Saudi IDs', () => {
    const { unmount } = render(<DocumentCard doc={{ identity_type: 'iqama', identity_last4: '1', iqama_expiry: '2026-11-01', entry_date: null, nationality: 'EG' }} now={now} />);
    expect(screen.getByText('منتهية منذ 23 يوم')).toBeTruthy();
    unmount();
    render(<DocumentCard doc={{ identity_type: 'national_id', identity_last4: '9', iqama_expiry: null, entry_date: null, nationality: 'SA' }} now={now} />);
    expect(screen.queryByRole('button', { name: 'تحديث الإقامة' })).toBeNull();
  });
});
