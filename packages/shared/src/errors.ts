export const ERROR_CODES = [
  'ORG_FORBIDDEN',
  'ORG_CR_TAKEN',
  'ORG_PHONE_TAKEN',
  'ORG_EMAIL_TAKEN',
  'ORG_UNIT_NOT_EMPTY',
  'ORG_UNIT_FIXED',
  'ORG_UNIT_CYCLE',
  'ORG_INVITE_INVALID',
  'ORG_INVITE_EXPIRED',
  'ORG_INVITE_USED',
  'ORG_POSITION_FILLED',
  'ORG_PLAN_LIMIT',
  'ORG_SUBSCRIPTION_INACTIVE',
  'ORG_VALIDATION',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES_AR: Record<ErrorCode, string> = {
  ORG_FORBIDDEN: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  ORG_CR_TAKEN: 'رقم السجل التجاري مسجل مسبقًا على المنصة.',
  ORG_PHONE_TAKEN: 'رقم الجوال مسجل مسبقًا.',
  ORG_EMAIL_TAKEN: 'البريد الإلكتروني مسجل مسبقًا.',
  ORG_UNIT_NOT_EMPTY: 'لا يمكن حذف الوحدة لأن بها موظفين أو وحدات فرعية. انقلهم أولًا.',
  ORG_UNIT_FIXED: 'هذه إدارة ثابتة ولا يمكن حذفها إلا بتحديد إدارة بديلة.',
  ORG_UNIT_CYCLE: 'لا يمكن نقل الوحدة تحت إحدى الوحدات التابعة لها.',
  ORG_INVITE_INVALID: 'رابط الدعوة غير صالح.',
  ORG_INVITE_EXPIRED: 'انتهت صلاحية رابط الدعوة. اطلب رابطًا جديدًا.',
  ORG_INVITE_USED: 'تم استخدام رابط الدعوة من قبل.',
  ORG_POSITION_FILLED: 'هذا المنصب مشغول بموظف حاليًا.',
  ORG_PLAN_LIMIT: 'تم الوصول للحد الأقصى لعدد الموظفين في باقتك.',
  ORG_SUBSCRIPTION_INACTIVE: 'اشتراك الشركة غير نشط. البيانات متاحة للقراءة فقط.',
  ORG_VALIDATION: 'البيانات المدخلة غير صحيحة.',
};

export function messageFor(code: string): string {
  return (ERROR_MESSAGES_AR as Record<string, string>)[code] ?? 'حدث خطأ غير متوقع';
}
