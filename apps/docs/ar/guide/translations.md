---
description: "21 لغة مدعومة وكيفية إنشاء أو تحسين الترجمات لـ SnapOtter باستخدام نظام i18n المُنفَّذ عبر TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 893bc01d86ad
---

# دليل الترجمة {#translation-guide}

يأتي SnapOtter مزوَّداً بـ 21 لغة جاهزة للاستخدام. يستخدم نظام i18n بيئة تشغيل مخصصة خفيفة مع اكتمال محلي مُنفَّذ عبر TypeScript وتقسيم ديناميكي للشيفرة.

## اللغات المدعومة {#supported-languages}

| الرمز | اللغة | الاسم الأصلي | الاتجاه |
|------|----------|-------------|-----------|
| `en` | English | English | LTR |
| `zh-CN` | Chinese (Simplified) | 简体中文 | LTR |
| `zh-TW` | Chinese (Traditional) | 繁體中文 | LTR |
| `ja` | Japanese | 日本語 | LTR |
| `ko` | Korean | 한국어 | LTR |
| `es` | Spanish | Español | LTR |
| `fr` | French | Français | LTR |
| `it` | Italian | Italiano | LTR |
| `pt-BR` | Portuguese (Brazil) | Português (Brasil) | LTR |
| `de` | German | Deutsch | LTR |
| `nl` | Dutch | Nederlands | LTR |
| `sv` | Swedish | Svenska | LTR |
| `ru` | Russian | Русский | LTR |
| `pl` | Polish | Polski | LTR |
| `uk` | Ukrainian | Українська | LTR |
| `ar` | Arabic | العربية | RTL |
| `tr` | Turkish | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamese | Tiếng Việt | LTR |
| `id` | Indonesian | Bahasa Indonesia | LTR |
| `th` | Thai | ไทย | LTR |

## كيف يعمل اكتشاف اللغة {#how-language-detection-works}

يستخدم SnapOtter ترتيب حل من ثلاث طبقات:

1. **تفضيل المستخدم** - مُخزَّن في `localStorage("snapotter-locale")` ومُزامَن مع إعدادات المستخدم عند المصادقة
2. **الاكتشاف التلقائي للمتصفح** - يمرّ عبر مصفوفة `navigator.languages` مع مطابقة بادئة BCP 47
3. **الافتراضي للنسخة** - متغير البيئة `DEFAULT_LOCALE` الخاص بالمسؤول (يُجلَب من `GET /api/v1/config/locale`)
4. **الرجوع إلى الإنجليزية** - متاح دائماً

يمكن للمستخدمين تغيير اللغة من:
- **محدد الكرة الأرضية في التذييل** (سطح المكتب، مرئي دائماً)
- محدد اللغة في **صفحة تسجيل الدخول** (قبل المصادقة)
- قسم **الإعدادات > عام** (تفضيل لكل مستخدم)
- القائمة المنسدلة للغة في **الشريط الجانبي للهاتف المحمول**
- يحدد قسم **الإعدادات > النظام** الافتراضي على مستوى النسخة (للمسؤول فقط)

## كيف تعمل الترجمات {#how-translations-work}

توجد جميع سلاسل واجهة المستخدم في `packages/shared/src/i18n/`. الملف المرجعي هو `en.ts`، الذي يصدّر كائناً مُنمَّطاً يحتوي على كل سلسلة يستخدمها التطبيق (~1500 مفتاح). اللغات الأخرى هي ملفات منفصلة (مثل `de.ts` و`fr.ts`) تصدّر الشكل نفسه.

يستخدم النوع `TranslationKeys` الأداة `DeepStringRecord` لقبول أي قيمة سلسلة مع فرض بنية المفاتيح. يكتشف TypeScript المفاتيح المفقودة في أي ملف ترجمة في وقت التصريف.

لا يُحمَّل سوى المحلي النشط في وقت التشغيل عبر `import()` ديناميكي، مما يبقي الحزمة الرئيسية صغيرة.

## استخدام الترجمات في المكوّنات {#using-translations-in-components}

```tsx
import { useTranslation } from "@/contexts/i18n-context";
import { format, plural } from "@/lib/format";

function MyComponent() {
  const { t, locale, setLocale } = useTranslation();
  
  return (
    <div>
      <h1>{t.common.settings}</h1>
      <p>{format(t.settings.people.deleteConfirm, { username: "admin" })}</p>
      <p>{plural(count, t.automate.fileCount, t.automate.fileCountPlural)}</p>
    </div>
  );
}
```

## المساهمة بترجمة {#contributing-a-translation}

نرحّب بطلبات سحب الترجمة مباشرة. يمكنك تحسين محلي موجود أو إضافة محلي جديد.

للإبلاغ عن ترجمة خاطئة دون تقديم شيفرة، افتح [مشكلة على GitHub](https://github.com/snapotter-hq/SnapOtter/issues) مع ذكر اللغة والسلسلة غير الصحيحة والإصلاح المقترح.

::: tip 
لا تتطلب طلبات سحب الترجمة موافقة مسبقة. انسخ المستودع، أجرِ تغييراتك، وافتح طلب سحب. راجع [دليل المساهمة](/ar/guide/contributing) للحصول على عملية طلب السحب الكاملة ومتطلب اتفاقية ترخيص المساهم.
:::

## كيفية إنشاء أو تحديث ترجمة {#how-to-create-or-update-a-translation}

### 1. انسخ واستنسخ {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. انسخ الملف المرجعي (للغة جديدة فقط) {#_2-copy-the-reference-file-new-language-only}

تخطَّ هذه الخطوة إذا كنت تحسّن ترجمة موجودة.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. ترجم السلاسل {#_3-translate-the-strings}

افتح ملفك الجديد وترجم كل قيمة سلسلة. أبقِ بنية الكائن والمفاتيح كما هي تماماً.

```ts
import type { TranslationKeys } from "./en.js";

export const xx: TranslationKeys = {
  common: {
    upload: "Your translation here",
    // ... translate all entries
  },
  // ... translate all sections
} as const;
```

القواعد:
- لا تترجم مفاتيح الكائن، بل قيم السلاسل فقط
- أبقِ `as const` في النهاية
- استورد `TranslationKeys` من `./en.js` ونمّط تصديرك
- أبقِ العناصر النائبة `{variable}` كما هي تماماً
- يجب أن تحتوي المصفوفات (`rotatingPhrases` و`progressMessages`) على العدد نفسه من الإدخالات
- لا تترجم: SnapOtter وJPEG وPNG وWebP وEXIF وAPI وغيرها من المصطلحات التقنية

### 4. سجّل المحلي (للغة جديدة فقط) {#_4-register-the-locale-new-language-only}

أضف محليّك إلى `SUPPORTED_LOCALES` في `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. تحقق {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. قدّم {#_6-submit}

افتح طلب سحب مقابل `main` بعنوان مثل `feat(i18n): add Swedish translation` أو `fix(i18n): correct German typos`. سيطلب منك روبوت اتفاقية ترخيص المساهم التوقيع في مساهمتك الأولى.

## إضافة مفاتيح ترجمة جديدة {#adding-new-translation-keys}

عند إضافة ميزة جديدة تحتاج سلاسل واجهة مستخدم جديدة:

1. أضف المفاتيح الجديدة إلى `en.ts` أولاً (الملف المرجعي)
2. شغّل `pnpm typecheck` - سيفشل كل ملف محلي إن كان المفتاح الجديد مفقوداً
3. أضف المفتاح الجديد إلى جميع ملفات المحلي (استخدم الإنجليزية كبديل مؤقت)

## التكوين {#configuration}

حدّد لغة النسخة الافتراضية عبر متغير البيئة:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## مرجع الملفات {#file-reference}

| الملف | الغرض |
|------|---------|
| `packages/shared/src/i18n/en.ts` | سلاسل الإنجليزية (المحلي المرجعي، ~1500 مفتاح) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`، `loadTranslations()`، تصديرات الأنواع |
| `packages/shared/src/i18n/<locale>.ts` | ملفات الترجمة لكل لغة |
| `apps/web/src/contexts/i18n-context.tsx` | خطاف `I18nProvider`، `useTranslation()` |
| `apps/web/src/lib/format.ts` | مساعدات `format()`، `plural()`، `formatFileSize()` |
| `apps/api/src/routes/config.ts` | نقطة النهاية العامة `GET /api/v1/config/locale` |
