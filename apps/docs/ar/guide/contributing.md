---
description: "كيفية المساهمة في SnapOtter. تقارير الأخطاء، طلبات الميزات، طلبات السحب، ومتطلبات اتفاقية ترخيص المساهم (CLA)."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: 1065d8b688c4
---

# المساهمة {#contributing}

شكرًا لاهتمامك بالمساهمة. يغطي هذا الدليل كيفية المشاركة، وما الذي نقبله، وكيفية البدء.

## طرق المساهمة {#ways-to-contribute}

### المشكلات (Issues) (لا تتطلب أي إعداد) {#issues-no-setup-required}

- **تقارير الأخطاء** - هل هناك شيء معطّل؟ افتح [تقرير خطأ](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) مع خطوات إعادة الإنتاج.
- **طلبات الميزات** - هل لديك فكرة؟ ابدأ [نقاشًا](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) حتى يتمكن المجتمع من إبداء رأيه والتصويت له.
- **مشكلات الترجمة** - هل اكتشفت ترجمة خاطئة أو ناقصة؟ افتح [مشكلة ترجمة](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **مشكلات التوثيق** - هل هناك خطأ ما في التوثيق؟ افتح [مشكلة توثيق](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### الكود (يتطلب اتفاقية CLA) {#code-requires-cla}

نقبل طلبات السحب لما يلي:

| النوع | العملية |
|------|---------|
| إصلاحات الأخطاء | افتح طلب سحب مباشرة (اربطه بالمشكلة إن وُجدت) |
| ترجمات جديدة | افتح طلب سحب مباشرة (انظر [دليل الترجمة](/ar/guide/translations)) |
| تحسينات التوثيق | افتح طلب سحب مباشرة |
| تحسينات تغطية الاختبارات | افتح طلب سحب مباشرة |
| أدوات أو ميزات جديدة | ابدأ [نقاشًا](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) أولًا؛ يحوّل أحد القائمين على المشروع الأفكار المعتمدة إلى مشكلة متتبَّعة قبل أن تكتب الكود |
| إعادة الهيكلة أو تغييرات المعمارية | ابدأ [نقاشًا](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) أولًا وانتظر موافقة أحد القائمين على المشروع قبل كتابة الكود |

### ما لن نقبله {#what-we-will-not-accept}

- التغييرات على سير عمل CI/CD أو إعدادات الإصدار أو إعدادات المدقق اللغوي/المترجم
- طلبات السحب من دون [اتفاقية ترخيص المساهم](#contributor-license-agreement) موقّعة
- طلبات السحب التي تتجاوز 400 سطر من التغيير (قسّم العمل الكبير إلى طلبات سحب أصغر)
- الميزات التي لم تُناقَش وتُعتمَد أولًا
- التغييرات على `packages/ai/` من دون نقاش مسبق

## اتفاقية ترخيص المساهم {#contributor-license-agreement}

قبل أن نتمكن من دمج أول طلب سحب لك، يجب أن توقّع [اتفاقية CLA الفردية](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) الخاصة بنا. هذا شرط لمرة واحدة.

**لماذا:** SnapOtter مرخّص بترخيص مزدوج (AGPLv3 + تجاري). تمنحنا اتفاقية CLA الحق في توزيع مساهماتك بموجب كلا الترخيصين. أنت تحتفظ بملكية حقوق النشر الكاملة لعملك.

**كيف:** عندما تفتح أول طلب سحب لك، سيعلّق روبوت CLA Assistant برابط. انقر عليه، وراجع الاتفاقية، ووقّع بحساب GitHub الخاص بك. يستغرق ذلك 30 ثانية.

إذا كنت تساهم نيابةً عن صاحب العمل ويحتفظ صاحب عملك بحقوق الملكية الفكرية على عملك، تواصل مع contact@snapotter.com لترتيب اتفاقية CLA للشركات قبل الإرسال.

## البدء {#getting-started}

### المتطلبات المسبقة {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (لأدوات الذكاء الاصطناعي فقط)
- Docker (اختياري، لاختبار التكامل الكامل)

### الإعداد {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### تشغيل الفحوصات {#running-checks}

قبل إرسال طلب سحب، تأكد من أن جميع الفحوصات تنجح محليًا:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## عملية طلب السحب {#pull-request-process}

1. انسخ المستودع (Fork) وأنشئ فرعًا من `main` (`feat/my-feature` أو `fix/issue-123`)
2. أجرِ تغييراتك في التزامات (commits) مركّزة وقابلة للمراجعة باستخدام [الالتزامات الاصطلاحية (conventional commits)](https://www.conventionalcommits.org/)
3. أضف أو حدّث الاختبارات لتغييراتك
4. شغّل `pnpm lint && pnpm typecheck && pnpm test` محليًا
5. افتح طلب سحب مقابل `main` واملأ القالب
6. وقّع اتفاقية CLA إن طُلب منك ذلك
7. انتظر نجاح CI ومراجعة أحد القائمين على المشروع

### توقعات المراجعة {#review-expectations}

- نهدف إلى الرد على طلبات السحب خلال 7 أيام
- طلبات السحب الصغيرة والمركّزة تُراجَع أسرع
- إذا لم تتلقَّ ردًا خلال 7 أيام، اترك تعليقًا للتنبيه على السلسلة
- قد نطلب تغييرات، أو نقترح نهجًا مختلفًا، أو نغلق طلب السحب إن لم يتوافق مع توجّه المشروع

### بعد دمج طلب السحب الخاص بك {#after-your-pr-is-merged}

ستُدرَج مساهمتك في الإصدار التالي وسيُنسَب لها الفضل في سجل التغييرات (changelog).

## المشكلات المناسبة للمبتدئين {#good-first-issues}

هل تبحث عن شيء تعمل عليه؟ راجع [المشكلات المناسبة للمبتدئين (good first issues)](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) للمهام الملائمة للمبتدئين، أو [المساعدة المطلوبة (help wanted)](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) للمهام الأكبر التي نقدّر فيها مساعدة المجتمع.

## أسلوب الكود {#code-style}

- يتولى Biome التنسيق والتدقيق اللغوي (علامات اقتباس مزدوجة، فواصل منقوطة، إزاحة بمسافتين)
- يشغّل خطاف ما قبل الالتزام (pre-commit) `biome check --write` على الملفات المُدرَجة تلقائيًا
- إذا اعترض المدقق اللغوي، أصلح الكود (لا تعدّل إعدادات Biome)
- وحدات ES في كل مكان (`import`/`export`)
- الالتزامات الاصطلاحية: `feat:`، `fix:`، `refactor:`، `docs:`، `test:`، `chore:`

للاطلاع على تفاصيل المعمارية الكاملة، انظر [دليل المطوّر](/ar/guide/developer).

## الأمان {#security}

**لا تفتح طلب سحب أو مشكلة عامّة للثغرات الأمنية.** أبلغ عنها بشكل خاص عبر [استشارات أمان GitHub (GitHub Security Advisories)](https://github.com/snapotter-hq/snapotter/security/advisories/new) أو عبر البريد الإلكتروني contact@snapotter.com. انظر [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) للاطلاع على التفاصيل الكاملة.

## أسئلة؟ {#questions}

- [التوثيق](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [نقاشات GitHub](https://github.com/snapotter-hq/snapotter/discussions)
