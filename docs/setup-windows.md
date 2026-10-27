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

## ٤) قاعدة البيانات (PostgreSQL)

من STEP 2 المشروع يستعمل قاعدة بيانات PostgreSQL. `pnpm dev` يشتغل حتى بدونها (يطلع تحذير فقط)، لكن أي شي يخص البيانات يحتاجها. اختار طريقة وحدة من الاثنتين.

> ملاحظة صادقة: هذي الخطوات جرّبتها على Linux فقط. على Windows اتبعها بالترتيب، وإذا طلعت رسالة خطأ أرسلها لي كما هي. الشرح الكامل بالإنجليزي في `docs/database.md`.

**الطريقة A: Docker (الأسهل)**

1. ثبّت **Docker Desktop** وشغّله وانتظر لين يقول "running".
2. من مجلد المشروع:

```
docker compose up -d
docker compose ps
```

   لازم تشوف الحالة `healthy` (تاخذ أقل من دقيقة أول مرة).
3. أنشئ الجداول:

```
pnpm db:migrate
```

القاعدة تسمع على جهازك فقط (`127.0.0.1`)، وكلمات السر فيها للتجربة المحلية فقط. إيقاف القاعدة: `docker compose down`. مسح كل بياناتها: `docker compose down -v`.

**الطريقة B: بدون Docker**

1. نزّل **PostgreSQL 18** من postgresql.org وثبّته. خل المنفذ `5432` واحفظ كلمة سر المستخدم `postgres`.
2. افتح **SQL Shell (psql)** والصق هذي الأوامر (غيّر المسار لمسار المشروع عندك، واستعمل `/` وليس `\`):

```
\i 'C:/Users/YOUR_NAME/scentiq/docker/postgres/01-dev-roles.sql'
CREATE DATABASE scentiq_dev OWNER scentiq_owner TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
```

3. أنشئ الجداول:

```
pnpm db:migrate
```

إذا طلعت رسالة `This database does not treat Arabic letters as word characters` معناها القاعدة انعملت بلغة (locale) غلط: احذفها وأعد الأمر `CREATE DATABASE` فوق. هذا الفحص موجود عمداً لأن البحث بالعربي يفشل بصمت بدونه.

**أوامر القاعدة**

| الأمر | شنو يسوي |
| --- | --- |
| `pnpm db:migrate` | يطبّق تعديلات الجداول الجديدة. آمن تعيده. |
| `pnpm db:reset` | يمسح كل شي ويبدأ من جديد. للتطوير المحلي فقط، ويرفض بأي بيئة غير التطوير وبأي قاعدة مو على جهازك. |
| `pnpm seed:dev` | بيانات تجريبية (للتطوير فقط، يرفض بالإنتاج). |

**اختبارات القاعدة** تشتغل فقط إذا عرّفت عنوان قاعدة للاختبار (بدونه تنتخطى ويُكتب ذلك). مع طريقة Docker:

```
$env:TEST_DATABASE_ADMIN_URL="postgres://postgres:devonly_admin@127.0.0.1:5432/postgres"
pnpm test
```

كل ملف اختبار ينشئ قاعدة فاضية خاصة به ويحذفها بعد ما يخلص، فما تتأثر بياناتك.

## ٥) التشغيل

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

## ٦) الفحوصات

```
pnpm check
```

يشغّل بالترتيب: lint، typecheck، الاختبارات، build، وفحص أن صفحات المطور لم تتسرب إلى نسخة الإنتاج.

اختبارات المتصفح (Playwright) تحتاج تنزيل المتصفح مرة واحدة:

```
pnpm --filter @scentiq/frontend exec playwright install chromium
pnpm test:e2e
```

## ٧) مشاكل شائعة

| المشكلة | الحل |
| --- | --- |
| `pnpm` غير معروف | أغلق PowerShell وافتحه من جديد. إذا استمرت المشكلة: `npm config get prefix` وتأكد أن هذا المجلد داخل `PATH`. |
| Execution policy يمنع تشغيل سكربتات | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| المنفذ 3000 أو 5173 مشغول | `netstat -ano \| findstr :3000` ثم `taskkill /PID <رقم> /F` |
| تحذيرات عن نهاية السطر (CRLF) | المستودع يفرض LF عبر `.gitattributes`. نفّذ `git config core.autocrlf false` ثم أعد `git checkout .` إذا ظهرت اختلافات غريبة. |
| `pnpm install` يرفض نسخة حزمة جديدة جداً | هذه سياسة حماية سلسلة التوريد في pnpm (`minimumReleaseAge`). انتظر حتى تنضج النسخة، أو ثبّت نسخة أقدم. لا تضف استثناءً بدون سبب مكتوب. |
| `docker compose up` يعطي خطأ أو `docker` غير معروف | Docker Desktop غير مشغّل أو غير مثبّت. شغّله وانتظر حتى يصير "running"، أو استعمل الطريقة B. |
| المنفذ 5432 مشغول | عندك PostgreSQL ثاني شغال. أوقفه، أو اختار الطريقة B واستعمله هو. |
| `password authentication failed` | كلمة السر بملف `.env` غير كلمة السر الفعلية. للتطوير استعمل القيم الموجودة في `.env.example` كما هي. |
| `role "scentiq_app" does not exist` | ما شغّلت ملف الأدوار قبل `pnpm db:migrate` (الخطوة ٢ بالطريقة B). هذا مقصود: ما نكمل بدون الدور. |
| الموقع يشتغل لكن `/readyz` يرجّع 503 | القاعدة مو شغالة أو العنوان بـ `.env` غلط. `/healthz` يبقى 200 لأن البرنامج نفسه سليم. |
