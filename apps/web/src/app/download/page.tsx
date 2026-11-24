export const metadata = { title: 'تحميل تطبيق org BU' };

export default function DownloadPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-6 py-12">
      <h1 className="text-2xl font-bold text-teal-800">تطبيق org BU</h1>
      <p className="text-sm text-slate-600">
        التطبيق مطلوب لتسجيل الحضور والانصراف بالبصمة والموقع، ولاستقبال الإشعارات على جوالك.
      </p>
      <a href="/downloads/org-bu.apk" className="block rounded-xl bg-teal-700 py-4 text-center text-lg font-bold text-white">
        تحميل تطبيق أندرويد
      </a>
      <ol className="list-decimal space-y-2 ps-5 text-sm text-slate-700">
        <li>اضغط زر التحميل وافتح الملف بعد اكتمال التنزيل.</li>
        <li>لو ظهرت رسالة &quot;مصدر غير معروف&quot;، اختر الإعدادات ثم فعّل &quot;السماح من هذا المصدر&quot;.</li>
        <li>اضغط &quot;تثبيت&quot;، ثم افتح التطبيق وسجّل الدخول برقم جوالك.</li>
        <li>اسمح للتطبيق بالموقع والإشعارات عند الطلب.</li>
      </ol>
      <p className="text-xs text-slate-400">نسخة iPhone ستتوفر لاحقًا.</p>
    </main>
  );
}
