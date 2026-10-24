# تشغيل ScentIQ على Windows

الشرح بالعربي البسيط، والأوامر والأسماء التقنية بالإنجليزي. افتح **PowerShell** وانسخ الأوامر كما هي.

> ملاحظة صادقة: كتبنا هذا الدليل وجرّبنا الأوامر نفسها على Linux. التحقق على Windows يتم تلقائياً عبر
> GitHub Actions (`windows-latest`) عند كل رفع. إذا فشلت خطوة عندك، لا تتجاوزها: أرسل لي رسالة الخطأ.

## ١) المتطلبات

| البرنامج | النسخة | كيف تتأكد |
| --- | --- | --- |
| Node.js | 24 LTS (من nodejs.org) | `node -v` يجب أن يبدأ بـ `v24` |
| pnpm | 12.10.1 | `pnpm -v` |
| Git | أي نسخة حديثة (من git-scm.com) | `git --version` |

تثبيت pnpm (مرة واحدة):

```
npm install -g pnpm@12.10.1
```

بعد التثبيت أغلق PowerShell وافتحه من جديد حتى يتعرف على الأمر `pnpm`.

## ٢) جلب الكود وتثبيت الاعتماديات

```
git clone git@github.com:hussien-15/scentiq.git
cd scentiq
pnpm install
```

إذا كنت تستعمل HTTPS بدل SSH: `git clone https://github.com/hussien-15/scentiq.git`.

## ٣) ملف الإعدادات

```
Copy-Item apps\backend\.env.example apps\backend\.env
```

القيم الافتراضية تكفي للتطوير المحلي. **لا ترفع ملف `.env` إلى Git أبداً** (الملف مستثنى في `.gitignore`).

## ٤) التشغيل

وضع التطوير (الصفحات تتحدث تلقائياً عند التعديل):

```
pnpm dev
```

ثم افتح `http://localhost:5173`. صفحة دليل التصميم على `http://localhost:5173/dev/style-guide`.

نسخة تشبه الإنتاج:

```
pnpm build
pnpm start
```

ثم افتح `http://localhost:3000`. هنا الـ backend يخدم الـ frontend بنفسه ويكتب الـ SEO shell لكل صفحة.

## ٥) الفحوصات

```
pnpm check
```

يشغّل بالترتيب: lint، typecheck، الاختبارات، build، وفحص أن صفحات المطور لم تتسرب إلى نسخة الإنتاج.

اختبارات المتصفح (Playwright) تحتاج تنزيل المتصفح مرة واحدة:

```
pnpm --filter @scentiq/frontend exec playwright install chromium
pnpm test:e2e
```

## ٦) مشاكل شائعة

| المشكلة | الحل |
| --- | --- |
| `pnpm` غير معروف | أغلق PowerShell وافتحه من جديد. إذا استمرت المشكلة: `npm config get prefix` وتأكد أن هذا المجلد داخل `PATH`. |
| Execution policy يمنع تشغيل سكربتات | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| المنفذ 3000 أو 5173 مشغول | `netstat -ano \| findstr :3000` ثم `taskkill /PID <رقم> /F` |
| تحذيرات عن نهاية السطر (CRLF) | المستودع يفرض LF عبر `.gitattributes`. نفّذ `git config core.autocrlf false` ثم أعد `git checkout .` إذا ظهرت اختلافات غريبة. |
| `pnpm install` يرفض نسخة حزمة جديدة جداً | هذه سياسة حماية سلسلة التوريد في pnpm (`minimumReleaseAge`). انتظر حتى تنضج النسخة، أو ثبّت نسخة أقدم. لا تضف استثناءً بدون سبب مكتوب. |
