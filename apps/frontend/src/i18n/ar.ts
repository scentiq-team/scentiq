import type { Messages } from './messages';

export const ar: Messages = {
  skipToContent: 'تخطّي إلى المحتوى',
  loading: 'جارٍ التحميل',
  nav: {
    label: 'التنقل الرئيسي',
    home: 'الرئيسية',
    openMenu: 'فتح القائمة',
    closeMenu: 'إغلاق القائمة',
  },
  language: {
    switchTo: 'English',
    switchLabel: 'التبديل إلى اللغة الإنجليزية',
  },
  footer: { rights: 'جميع الحقوق محفوظة.' },
  home: {
    statusTitle: 'المتجر قيد التجهيز',
    statusBody: 'نجهّز تشكيلة العطور حالياً. عُد إلينا قريباً.',
  },
  notFound: {
    body: 'قد يكون الرابط قديماً أو تمت إزالة الصفحة.',
    action: 'العودة إلى الرئيسية',
  },
  studio: {
    title: 'Perfume Studio',
    body: 'لوحة الإدارة قيد التجهيز. تسجيل الدخول وإدارة الطلبات والمنتجات تأتي في مراحل لاحقة.',
    action: 'العودة إلى المتجر',
  },
  errorState: {
    title: 'حدث خطأ',
    retry: 'إعادة المحاولة',
    reference: 'رقم المرجع',
  },
  errors: {
    bad_request: 'تعذّر فهم الطلب. حاول مرة أخرى.',
    validation_error: 'بعض البيانات غير صحيحة. راجعها وحاول مرة أخرى.',
    unauthorized: 'يلزم تسجيل الدخول للمتابعة.',
    forbidden: 'ليست لديك صلاحية لهذا الإجراء.',
    not_found: 'لم نجد ما تبحث عنه.',
    conflict: 'تغيّرت الحالة في هذه الأثناء. حدّث الصفحة وحاول مجدداً.',
    rate_limited: 'محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مجدداً.',
    internal_error: 'حدث خطأ من جهتنا. حاول مرة أخرى بعد قليل.',
    service_unavailable: 'الخدمة غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.',
    network_error: 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً.',
    invalid_response: 'وصل رد غير متوقع من الخادم. حاول مرة أخرى.',
  },
};
