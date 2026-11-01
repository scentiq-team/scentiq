# معاينة خاصة للواجهة على Cloudflare Pages

**الغرض:** تشوف واجهة المتجر بعد كل خطوة برابط خاص، بدون ما تشغّل شي على جهازك.
**الحدود:** هذي معاينة للواجهة فقط (التصميم، RTL، الموبايل، صفحة الـ style guide). ما فيها backend ولا قاعدة بيانات، فالمنتجات والأسعار الحقيقية ما تظهر. الموقع الكامل يجي بـ staging على VPS (Phase 13).
**تحذير:** المعاينة تحتوي صفحات المطوّر. لا تربط بيها دومين الموقع الحقيقي أبداً.

## 1. ربط المستودع (مرة وحدة)
1. ادخل https://dash.cloudflare.com ← **Workers & Pages** ← **Create** ← **Pages** ← **Connect to Git**.
2. اختر GitHub، واسمح لـ Cloudflare بالوصول لمستودع `scentiq-team/scentiq` فقط (Only select repositories).
3. الإعدادات:
   - **Production branch:** `main`
   - **Build command:** `pnpm install --frozen-lockfile && pnpm build:preview`
   - **Build output directory:** `apps/frontend/dist-e2e`
   - **Environment variables:** `NODE_VERSION` = `24` ، و`PNPM_VERSION` = `12.10.1`
4. اضغط **Save and Deploy**. أول بناء ياخذ بضع دقائق.

## 2. جعل الرابط خاصاً (Cloudflare Access)
1. من **Workers & Pages** ← مشروعك ← **Settings** ← **General** ← **Access policy** ← **Enable**. (يحمي رابط `*.pages.dev` ورابط كل فرع.)
2. اذهب للـ policy واختر **Allow**، وحدد **Emails** وأضف إيميلك وإيميل صديقك.
3. جرّب الرابط من نافذة خاصة: لازم يطلب إيميلك ويرسل كود دخول.

## 3. الاستعمال اليومي
- كل `git push` ينشر تلقائياً.
- كل فرع له رابط معاينة خاص (مثلاً `step-3-catalog.<مشروعك>.pages.dev`). الرابط يظهر في تبويب Deployments وبتعليق الـ PR.
- بعد دمج الفرع بـ `main` يتحدث الرابط الأساسي.

## ملاحظات
- `_redirects` يخلي الروابط العميقة (`/p/test`) تشتغل، و`_headers` يمنع محركات البحث (noindex).
- الواجهة تنادي `/api/...`. بالمعاينة ما كو backend، فتطلع حالة "غير متصل". هذا متوقع.
- إذا فشل البناء، انسخ آخر 30 سطر من سجل Build وارسلها.
- حدود الخطة المجانية وخيارات Access قد تتغير: راجع صفحة الأسعار بـ Cloudflare قبل الاعتماد.
