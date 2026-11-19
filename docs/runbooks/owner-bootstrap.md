# جعل رقم جوال صاحب منصة (Platform owner)

1. سجّل الدخول مرة واحدة على تطبيق الويب برقم الجوال (صفحة `/login`).
2. نفّذ في SQL Editor على مشروع Supabase `org-bu` (أو عبر Claude):

```sql
insert into platform_admins (user_id)
select id from auth.users where phone = '9665XXXXXXXX';  -- الرقم بدون +
```

3. حدّث الصفحة: ستُفتح لوحة صاحب المنصة على `/admin/companies`.

لإزالة الصلاحية: `delete from platform_admins where user_id = (select id from auth.users where phone = '9665XXXXXXXX');`
