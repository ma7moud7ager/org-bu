import type { ReactNode } from 'react';
import { requestStatusBadge, requestSummary, TONE_CLASSES, REQUEST_TYPE_AR } from '@/lib/requests';
import { positionLabelsOf, type RequestRow } from '@/lib/request-row';
import { Card } from '@/components/ui';

export function RequestCard({ r, children }: { r: RequestRow; children?: ReactNode }) {
  const badge = requestStatusBadge(r.status);
  const summary = requestSummary(r, positionLabelsOf(r)) + (r.new_unit_name ? ` (${r.new_unit_name})` : '');
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{REQUEST_TYPE_AR[r.type]} — {r.subject_name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_CLASSES[badge.tone]}`}>{badge.label}</span>
        <span className="ms-auto text-xs text-slate-400">{r.created_at.slice(0, 10)} · من {r.requester_name}</span>
      </div>
      <p className="text-sm text-slate-700">{summary}</p>
      {r.payload.note ? <p className="text-sm text-slate-500">ملاحظة: {r.payload.note as string}</p> : null}
      {r.status === 'postponed' && r.postponed_until ? <p className="text-sm text-slate-500">مؤجل حتى {r.postponed_until}</p> : null}
      {r.decision_note ? <p className="text-sm text-slate-500">رد {r.decided_by_name ?? ''}: {r.decision_note}</p> : null}
      {children}
    </Card>
  );
}
