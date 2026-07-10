---
description: "SnapOtter के लिए 21 समर्थित भाषाएँ और TypeScript-प्रवर्तित i18n सिस्टम का उपयोग करके अनुवाद बनाने या सुधारने का तरीका।"
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 65bc0bf7b768
---

# अनुवाद गाइड {#translation-guide}

SnapOtter बॉक्स से बाहर ही 21 भाषाओं के साथ आता है। i18n सिस्टम एक हल्के कस्टम रनटाइम का उपयोग करता है, जिसमें TypeScript-प्रवर्तित लोकेल पूर्णता और डायनामिक कोड-स्प्लिटिंग शामिल है।

## समर्थित भाषाएँ {#supported-languages}

| Code | Language | Native Name | Direction |
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

## भाषा पहचान कैसे काम करती है {#how-language-detection-works}

SnapOtter एक तीन-स्तरीय समाधान क्रम का उपयोग करता है:

1. **उपयोगकर्ता वरीयता** - `localStorage("snapotter-locale")` में संग्रहीत होती है और प्रमाणित होने पर उपयोगकर्ता सेटिंग्स के साथ सिंक होती है
2. **ब्राउज़र स्वतः-पहचान** - BCP 47 प्रीफ़िक्स मिलान के साथ `navigator.languages` ऐरे को क्रमवार जाँचता है
3. **इंस्टेंस डिफ़ॉल्ट** - एडमिन का `DEFAULT_LOCALE` env वेरिएबल (`GET /api/v1/config/locale` से प्राप्त किया गया)
4. **English फ़ॉलबैक** - हमेशा उपलब्ध

उपयोगकर्ता यहाँ से भाषा बदल सकते हैं:
- **फ़ुटर Globe चयनकर्ता** (डेस्कटॉप, हमेशा दृश्यमान)
- **लॉगिन पेज** भाषा चयनकर्ता (प्री-ऑथ)
- **Settings > General** अनुभाग (प्रति-उपयोगकर्ता वरीयता)
- **मोबाइल साइडबार** भाषा ड्रॉपडाउन
- **Settings > System** अनुभाग इंस्टेंस-व्यापी डिफ़ॉल्ट सेट करता है (केवल एडमिन)

## अनुवाद कैसे काम करते हैं {#how-translations-work}

सभी UI स्ट्रिंग `packages/shared/src/i18n/` में रहती हैं। संदर्भ फ़ाइल `en.ts` है, जो ऐप द्वारा उपयोग की जाने वाली हर स्ट्रिंग (~1500 keys) के साथ एक typed ऑब्जेक्ट एक्सपोर्ट करती है। अन्य भाषाएँ अलग फ़ाइलें हैं (उदा., `de.ts`, `fr.ts`) जो समान आकार एक्सपोर्ट करती हैं।

`TranslationKeys` टाइप `DeepStringRecord` का उपयोग करके किसी भी स्ट्रिंग मान को स्वीकार करता है, साथ ही key संरचना को प्रवर्तित करता है। TypeScript कंपाइल समय पर किसी भी अनुवाद फ़ाइल में गायब keys पकड़ लेता है।

रनटाइम पर केवल सक्रिय लोकेल ही डायनामिक `import()` के माध्यम से लोड होता है, जिससे मुख्य बंडल छोटा रहता है।

## कॉम्पोनेंट में अनुवाद का उपयोग {#using-translations-in-components}

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

## अनुवाद में योगदान {#contributing-a-translation}

हम सीधे अनुवाद PRs का स्वागत करते हैं। आप किसी मौजूदा लोकेल को सुधार सकते हैं या नया जोड़ सकते हैं।

कोड सबमिट किए बिना किसी गलत अनुवाद की रिपोर्ट करने के लिए, भाषा, गलत स्ट्रिंग और सुझाए गए सुधार के साथ एक [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) खोलें।

::: tip 
अनुवाद PRs के लिए पूर्व अनुमोदन की आवश्यकता नहीं होती। repo को fork करें, अपने बदलाव करें, और एक PR खोलें। पूरी PR प्रक्रिया और CLA आवश्यकता के लिए [Contributing Guide](/hi/guide/contributing) देखें।
:::

## अनुवाद कैसे बनाएँ या अपडेट करें {#how-to-create-or-update-a-translation}

### 1. Fork और clone करें {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. संदर्भ फ़ाइल कॉपी करें (केवल नई भाषा के लिए) {#_2-copy-the-reference-file-new-language-only}

यदि आप किसी मौजूदा अनुवाद को सुधार रहे हैं तो इस चरण को छोड़ दें।

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. स्ट्रिंग का अनुवाद करें {#_3-translate-the-strings}

अपनी नई फ़ाइल खोलें और हर स्ट्रिंग मान का अनुवाद करें। ऑब्जेक्ट संरचना और keys को बिल्कुल समान रखें।

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

नियम:
- ऑब्जेक्ट keys का अनुवाद न करें, केवल स्ट्रिंग मानों का करें
- `as const` को अंत में रखें
- `./en.js` से `TranslationKeys` इम्पोर्ट करें और अपने एक्सपोर्ट को टाइप करें
- `{variable}` प्लेसहोल्डर को बिल्कुल जस-का-तस रखें
- ऐरे (`rotatingPhrases`, `progressMessages`) में समान संख्या में एंट्रियाँ होनी चाहिए
- इनका अनुवाद न करें: SnapOtter, JPEG, PNG, WebP, EXIF, API, और अन्य तकनीकी शब्द

### 4. लोकेल रजिस्टर करें (केवल नई भाषा के लिए) {#_4-register-the-locale-new-language-only}

`packages/shared/src/i18n/index.ts` में `SUPPORTED_LOCALES` में अपना लोकेल जोड़ें:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. सत्यापित करें {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. सबमिट करें {#_6-submit}

`feat(i18n): add Swedish translation` या `fix(i18n): correct German typos` जैसे शीर्षक के साथ `main` के विरुद्ध एक PR खोलें। CLA बॉट आपके पहले योगदान पर आपसे साइन करने को कहेगा।

## नई अनुवाद keys जोड़ना {#adding-new-translation-keys}

जब कोई नया फ़ीचर जोड़ते हैं जिसे नई UI स्ट्रिंग की आवश्यकता होती है:

1. पहले नई keys को `en.ts` में जोड़ें (संदर्भ फ़ाइल)
2. `pnpm typecheck` चलाएँ - नई key गायब होने पर हर लोकेल फ़ाइल फ़ेल हो जाएगी
3. सभी लोकेल फ़ाइलों में नई key जोड़ें (अस्थायी फ़ॉलबैक के रूप में English का उपयोग करें)

## कॉन्फ़िगरेशन {#configuration}

एनवायरनमेंट वेरिएबल के माध्यम से इंस्टेंस डिफ़ॉल्ट भाषा सेट करें:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## फ़ाइल संदर्भ {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | English स्ट्रिंग (संदर्भ लोकेल, ~1500 keys) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, टाइप एक्सपोर्ट |
| `packages/shared/src/i18n/<locale>.ts` | प्रति-भाषा अनुवाद फ़ाइलें |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` hook |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` हेल्पर |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` सार्वजनिक एंडपॉइंट |
