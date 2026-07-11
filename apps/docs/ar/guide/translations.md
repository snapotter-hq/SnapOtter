---
description: "21 لغة مدعومة وكيفية إنشاء الترجمات أو تحسينها لـ SnapOtter باستخدام نظام i18n المدعوم بـ TypeScript."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: a9364069dea0
---

# دليل الترجمة {#translation-guide}

يأتي SnapOtter مزوّدًا بـ 21 لغة جاهزة للاستخدام. يستخدم نظام i18n وقت تشغيل مخصصًا خفيف الوزن مع اكتمال اللغات المفروض عبر TypeScript وتقسيم الشيفرة الديناميكي.

## اللغات المدعومة {#supported-languages}

| الرمز | اللغة | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | الإنجليزية | English | LTR |
| `zh-CN` | الصينية (المبسطة) | 简体中文 | LTR |
| `zh-TW` | الصينية (التقليدية) | 繁體中文 | LTR |
| `ja` | اليابانية | 日本語 | LTR |
| `ko` | الكورية | 한국어 | LTR |
| `es` | الإسبانية | Español | LTR |
| `fr` | الفرنسية | Français | LTR |
| `it` | الإيطالية | Italiano | LTR |
| `pt-BR` | البرتغالية (البرازيل) | Português (Brasil) | LTR |
| `de` | الألمانية | Deutsch | LTR |
| `nl` | الهولندية | Nederlands | LTR |
| `sv` | السويدية | Svenska | LTR |
| `ru` | الروسية | Русский | LTR |
| `pl` | البولندية | Polski | LTR |
| `uk` | الأوكرانية | Українська | LTR |
| `ar` | العربية | العربية | RTL |
| `tr` | التركية | Türkçe | LTR |
| `hi` | الهندية | हिन्दी | LTR |
| `vi` | الفيتنامية | Tiếng Việt | LTR |
| `id` | الإندونيسية | Bahasa Indonesia | LTR |
| `th` | التايلاندية | ไทย | LTR |

## كيف يعمل اكتشاف اللغة {#how-language-detection-works}

يستخدم SnapOtter ترتيب حلٍّ من ثلاث طبقات:

1. **تفضيل المستخدم** - مخزَّن في `localStorage("snapotter-locale")` ومتزامن مع إعدادات المستخدم عند تسجيل الدخول
2. **الاكتشاف التلقائي للمتصفح** - يمرّ عبر مصفوفة `navigator.languages` مع مطابقة بادئة BCP 47
3. **الافتراضي للنسخة** - متغيّر البيئة `DEFAULT_LOCALE` الخاص بالمشرف (يُجلَب من `GET /api/v1/config/locale`)
4. **الرجوع إلى الإنجليزية** - متاح دائمًا

يمكن للمستخدمين تغيير اللغة من:
- **محدِّد الكرة الأرضية في التذييل** (سطح المكتب، ظاهر دائمًا)
- محدِّد اللغة في **صفحة تسجيل الدخول** (قبل المصادقة)
- قسم **الإعدادات > عام** (تفضيل لكل مستخدم)
- قائمة اللغة المنسدلة في **الشريط الجانبي للجوال**
- قسم **الإعدادات > النظام** يحدّد الافتراضي على مستوى النسخة (للمشرف فقط)

## كيف تعمل الترجمات {#how-translations-work}

توجد جميع سلاسل واجهة المستخدم في `packages/shared/src/i18n/`. الملف المرجعي هو `en.ts`، الذي يصدّر كائنًا مُنمَّطًا يحتوي على كل سلسلة يستخدمها التطبيق (نحو 1500 مفتاح). اللغات الأخرى هي ملفات منفصلة (مثل `de.ts` و `fr.ts`) تصدّر البنية نفسها.

يستخدم النوع `TranslationKeys` الأداة `DeepStringRecord` لقبول أي قيمة سلسلة مع فرض بنية المفاتيح. يلتقط TypeScript المفاتيح المفقودة في أي ملف ترجمة في وقت التصريف.

يُحمَّل فقط الإعداد اللغوي النشط في وقت التشغيل عبر `import()` الديناميكي، مما يُبقي الحزمة الرئيسية صغيرة.

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

نرحّب بطلبات سحب الترجمة مباشرة. يمكنك تحسين إعداد لغوي موجود أو إضافة إعداد جديد.

للإبلاغ عن ترجمة خاطئة دون تقديم شيفرة، افتح [مشكلة على GitHub](https://github.com/snapotter-hq/SnapOtter/issues) مع ذكر اللغة والسلسلة غير الصحيحة والإصلاح المقترح.

::: tip 
لا تتطلب طلبات سحب الترجمة موافقة مسبقة. انسخ المستودع (fork)، وأجرِ تغييراتك، وافتح طلب سحب. راجع [دليل المساهمة](/ar/guide/contributing) لمعرفة عملية طلب السحب الكاملة ومتطلب CLA.
:::

## كيفية إنشاء ترجمة أو تحديثها {#how-to-create-or-update-a-translation}

### 1. انسخ المستودع (fork) واستنسخه {#_1-fork-and-clone}

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

افتح ملفك الجديد وترجم كل قيمة سلسلة. أبقِ بنية الكائن والمفاتيح كما هي تمامًا.

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
- لا تترجم مفاتيح الكائن، بل القيم النصية فقط
- أبقِ `as const` في النهاية
- استورد `TranslationKeys` من `./en.js` ونمّط تصديرك
- أبقِ العناصر النائبة `{variable}` كما هي تمامًا
- يجب أن تحتوي المصفوفات (`rotatingPhrases` و `progressMessages`) على العدد نفسه من المدخلات
- لا تترجم: SnapOtter و JPEG و PNG و WebP و EXIF و API وغيرها من المصطلحات التقنية

### 4. سجّل الإعداد اللغوي (للغة جديدة فقط) {#_4-register-the-locale-new-language-only}

أضف إعدادك اللغوي إلى `SUPPORTED_LOCALES` في `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. تحقّق {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. أرسل {#_6-submit}

افتح طلب سحب على `main` بعنوان مثل `feat(i18n): add Swedish translation` أو `fix(i18n): correct German typos`. سيطلب منك روبوت CLA التوقيع عند مساهمتك الأولى.

## إضافة مفاتيح ترجمة جديدة {#adding-new-translation-keys}

عند إضافة ميزة جديدة تحتاج إلى سلاسل واجهة مستخدم جديدة:

1. أضف المفاتيح الجديدة إلى `en.ts` أولًا (الملف المرجعي)
2. شغّل `pnpm typecheck` - سيفشل كل ملف إعداد لغوي إذا كان يفتقد المفتاح الجديد
3. أضف المفتاح الجديد إلى جميع ملفات الإعداد اللغوي (استخدم الإنجليزية كخيار رجوع مؤقت)

## الإعداد {#configuration}

حدّد لغة النسخة الافتراضية عبر متغيّر البيئة:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## مرجع الملفات {#file-reference}

| الملف | الغرض |
|------|---------|
| `packages/shared/src/i18n/en.ts` | سلاسل الإنجليزية (الإعداد اللغوي المرجعي، نحو 1500 مفتاح) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES` و `loadTranslations()` وتصديرات الأنواع |
| `packages/shared/src/i18n/<locale>.ts` | ملفات الترجمة لكل لغة |
| `apps/web/src/contexts/i18n-context.tsx` | خطاف `I18nProvider` و `useTranslation()` |
| `apps/web/src/lib/format.ts` | مساعدات `format()` و `plural()` و `formatFileSize()` |
| `apps/api/src/routes/config.ts` | نقطة النهاية العامة `GET /api/v1/config/locale` |

## ترجمة الموقع الإلكتروني والوثائق ومرجع API {#translating-the-web-surfaces}

يغطي دعم الـ 21 لغة أعلاه **التطبيق**. الموقع العام
(snapotter.com)، وموقع الوثائق هذا، ومرجع REST API مترجمة أيضًا
إلى جميع الـ 21 لغة، بواسطة مسار منفصل مقيَّد بالتجزئة يعيد استخدام
أسماء الأدوات وأوصافها نفسها من `packages/shared/src/i18n`، لذا
تبقى المصطلحات متسقة في كل مكان.

### مترجمة آليًا افتراضيًا {#machine-translated-by-default}

كل صفحة غير إنجليزية على الموقع والوثائق **مترجمة آليًا** في
التمريرة الأولى (بواسطة جلسة Claude Code، وليس خدمة طرف ثالث) وتحمل
شعارًا صغيرًا قابلًا للإغلاق يوضّح ذلك، مع رابط للعودة إلى هنا. هذا متعمَّد:
فهو يشحن جميع الـ 21 لغة بسرعة وبصدق، ثم يدعو المجتمع إلى
تحسين الصفحات الأهم. الترجمة الآلية توصّل المعنى؛
والمراجعة البشرية تجعله يُقرأ بشكل طبيعي.

### كيف يقرّر المسار ما يترجمه {#how-the-web-pipeline-decides}

تُجزَّأ كل وحدة قابلة للترجمة من المصدر الإنجليزي، وتُخزَّن التجزئة بجوار
ترجمتها. في كل تشغيل، يقوم المسار بما يلي:

- يترجم أي وحدة ليس لها ترجمة بعد،
- يتخطى أي وحدة لا يزال تجزئتها المخزَّنة يطابق المصدر الإنجليزي،
- يعيد ترجمة وحدة **آلية** عندما يتغير مصدرها الإنجليزي،
- ويضع علامة على وحدة **بشرية** مُنقَّحة بوسم `stale` (تحتاج مراجعة) عندما يتغير مصدرها
  الإنجليزي، بدلًا من الكتابة فوق عملك.

### تنقيح ترجمة ويب عبر طلب سحب {#refining-a-web-translation-by-pr}

تحسّن ترجمة موقع أو وثائق أو مرجع API بالطريقة نفسها التي
تحسّن بها إعدادًا لغويًا للتطبيق: بتحرير الملف المُولَّد وفتح طلب سحب.

1. اعثر على الترجمة المُولَّدة للغتك:
   - سلاسل واجهة الموقع: `apps/landing/src/i18n/<locale>.json`
   - صفحة وثائق: `apps/docs/<locale>/**.md`
   - مرجع API: `apps/api/src/openapi.<locale>.yaml`
2. حرّر النص. أبقِ الشيفرة والروابط و `{placeholders}` وأي علامات `⸤I18N…⸥`
   كما هي تمامًا؛ فمُدقّق المسار يرفض أي ترجمة تُسقط
   هذه العناصر أو تعيد ترتيبها.
3. افتح طلب سحب. يقلب تحرير الوحدة مصدرها من `machine` إلى `human`، لذا
   لن **يكتب المسار فوقها أبدًا** في تشغيل لاحق. إذا تغير المصدر الإنجليزي
   بعد ذلك، توضَع علامة على وحدتك بوسم `stale` للمراجعة بدلًا من
   استبدالها بصمت.

للإبلاغ عن ترجمة خاطئة دون تقديم شيفرة، افتح
[مشكلة على GitHub](https://github.com/snapotter-hq/SnapOtter/issues) مع ذكر عنوان
URL للصفحة واللغة والنص غير الصحيح وإصلاحك المقترح.

::: tip 
يشغّل المشرفون مسار الترجمة؛ لست بحاجة إلى مفتاح API
للمساهمة. فقط حرّر الملف المُولَّد وافتح طلب سحب. راجع
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
لمعرفة كيفية تشغيل المسار.
:::