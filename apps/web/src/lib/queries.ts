// positions ↔ org_units are linked by two foreign keys (org_unit_id and org_units.manager_position_id),
// so embeds between them must name the FK or PostgREST answers 300 (ambiguous) and returns no rows.
export const EMPLOYEES_LIST_SELECT =
  'id, full_name, phone, identity_last4, status, positions(title, org_units!positions_org_unit_id_fkey(name))';
