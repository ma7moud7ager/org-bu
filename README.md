# org BU

منصة SaaS لإدارة الشركات (ويب + موبايل + ديسكتوب). التصميم: `docs/superpowers/specs/`، الخطط: `docs/superpowers/plans/`.

## الهيكل
- `packages/shared` — قواعد الشغل المشتركة (الصلاحيات، الهيكل، التحقق، رسائل الأخطاء بالعربي)
- `supabase/migrations` — قاعدة البيانات (RLS + RPCs)
- `apps/web` — تطبيق الويب (Next.js)

## التشغيل
```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local   # ضع رابط ومفتاح Supabase
pnpm --filter web dev
```

## الاختبارات
```bash
pnpm --filter @orgbu/shared test   # قواعد الشغل
bash scripts/db-test.sh            # قاعدة البيانات (Postgres 16 محلي)
pnpm --filter web test             # تطبيق الويب
```
