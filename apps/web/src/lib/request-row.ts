export type RequestRow = {
  id: string; type: 'termination' | 'transfer'; status: string; payload: Record<string, unknown>; created_at: string;
  decision_note: string | null; postponed_until: string | null; subject_id: string; subject_name: string;
  requester_name: string; decided_by_name: string | null; target_label: string | null; new_unit_name: string | null;
};

export const positionLabelsOf = (r: RequestRow): Record<string, string> =>
  r.target_label ? { [r.payload.target_position as string]: r.target_label } : {};
