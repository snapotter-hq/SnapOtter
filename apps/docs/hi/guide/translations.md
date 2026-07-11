---
description: "21 समर्थित भाषाएँ और TypeScript-प्रवर्तित i18n सिस्टम का उपयोग करके SnapOtter के लिए अनुवाद कैसे बनाएँ या सुधारें।"
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 6062f7bb34d4
---

# अनुवाद गाइड {#translation-guide}

SnapOtter बॉक्स से बाहर 21 भाषाओं के साथ आता है। i18n सिस्टम TypeScript-प्रवर्तित लोकेल पूर्णता और डायनामिक कोड-स्प्लिटिंग के साथ एक हल्के कस्टम रनटाइम का उपयोग करता है।

## समर्थित भाषाएँ {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | अंग्रेज़ी | English | LTR |
| `zh-CN` | चीनी (सरलीकृत) | 简体中文 | LTR |
| `zh-TW` | चीनी (पारंपरिक) | 繁體中文 | LTR |
| `ja` | जापानी | 日本語 | LTR |
| `ko` | कोरियाई | 한국어 | LTR |
| `es` | स्पेनिश | Español | LTR |
| `fr` | फ़्रेंच | Français | LTR |
| `it` | इतालवी | Italiano | LTR |
| `pt-BR` | पुर्तगाली (ब्राज़ील) | Português (Brasil) | LTR |
| `de` | जर्मन | Deutsch | LTR |
| `nl` | डच | Nederlands | LTR |
| `sv` | स्वीडिश | Svenska | LTR |
| `ru` | रूसी | Русский | LTR |
| `pl` | पोलिश | Polski | LTR |
| `uk` | यूक्रेनी | Українська | LTR |
| `ar` | अरबी | العربية | RTL |
| `tr` | तुर्की | Türkçe | LTR |
| `hi` | हिंदी | हिन्दी | LTR |
| `vi` | वियतनामी | Tiếng Việt | LTR |
| `id` | इंडोनेशियाई | Bahasa Indonesia | LTR |
| `th` | थाई | ไทย | LTR |

## भाषा पहचान कैसे काम करती है {#how-language-detection-works}

SnapOtter एक तीन-स्तरीय समाधान क्रम का उपयोग करता है:

1. **उपयोगकर्ता वरीयता** - `localStorage("snapotter-locale")` में संग्रहीत होती है और प्रमाणित होने पर उपयोगकर्ता सेटिंग्स के साथ सिंक हो जाती है
2. **ब्राउज़र ऑटो-डिटेक्ट** - BCP 47 प्रीफ़िक्स मिलान के साथ `navigator.languages` ऐरे को टटोलता है
3. **इंस्टेंस डिफ़ॉल्ट** - एडमिन का `DEFAULT_LOCALE` env वेरिएबल (`GET /api/v1/config/locale` से प्राप्त किया गया)
4. **अंग्रेज़ी फ़ॉलबैक** - हमेशा उपलब्ध

उपयोगकर्ता भाषा यहाँ से बदल सकते हैं:
- **फ़ुटर Globe सेलेक्टर** (डेस्कटॉप, हमेशा दिखाई देता है)
- **लॉगिन पेज** भाषा सेलेक्टर (प्री-ऑथ)
- **Settings > General** सेक्शन (प्रति-उपयोगकर्ता वरीयता)
- **मोबाइल साइडबार** भाषा ड्रॉपडाउन
- **Settings > System** सेक्शन इंस्टेंस-व्यापी डिफ़ॉल्ट सेट करता है (केवल एडमिन)

## अनुवाद कैसे काम करते हैं {#how-translations-work}

सभी UI स्ट्रिंग्स `packages/shared/src/i18n/` में रहती हैं। संदर्भ फ़ाइल `en.ts` है, जो ऐप द्वारा उपयोग की जाने वाली हर स्ट्रिंग (~1500 keys) के साथ एक टाइप्ड ऑब्जेक्ट एक्सपोर्ट करती है। अन्य भाषाएँ अलग फ़ाइलें हैं (जैसे, `de.ts`, `fr.ts`) जो समान आकार को एक्सपोर्ट करती हैं।

`TranslationKeys` टाइप key संरचना को प्रवर्तित करते हुए किसी भी स्ट्रिंग मान को स्वीकार करने के लिए `DeepStringRecord` का उपयोग करता है। TypeScript कंपाइल समय पर किसी भी अनुवाद फ़ाइल में गायब keys को पकड़ लेता है।

रनटाइम पर केवल सक्रिय लोकेल डायनामिक `import()` के माध्यम से लोड होता है, जिससे मुख्य बंडल छोटा रहता है।

## कंपोनेंट्स में अनुवादों का उपयोग करना {#using-translations-in-components}

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

## अनुवाद में योगदान देना {#contributing-a-translation}

हम सीधे अनुवाद PRs का स्वागत करते हैं। आप किसी मौजूदा लोकेल को सुधार सकते हैं या एक नया जोड़ सकते हैं।

कोड सबमिट किए बिना किसी ग़लत अनुवाद की रिपोर्ट करने के लिए, भाषा, ग़लत स्ट्रिंग और सुझाए गए सुधार के साथ एक [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) खोलें।

::: tip 
अनुवाद PRs के लिए पूर्व अनुमोदन की आवश्यकता नहीं होती। रेपो को फ़ोर्क करें, अपने बदलाव करें, और एक PR खोलें। पूरी PR प्रक्रिया और CLA आवश्यकता के लिए [Contributing Guide](/hi/guide/contributing) देखें।
:::

## अनुवाद कैसे बनाएँ या अपडेट करें {#how-to-create-or-update-a-translation}

### 1. फ़ोर्क और क्लोन करें {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. संदर्भ फ़ाइल कॉपी करें (केवल नई भाषा) {#_2-copy-the-reference-file-new-language-only}

यदि आप किसी मौजूदा अनुवाद को सुधार रहे हैं तो इस चरण को छोड़ दें।

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. स्ट्रिंग्स का अनुवाद करें {#_3-translate-the-strings}

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
- अंत में `as const` रखें
- `./en.js` से `TranslationKeys` इम्पोर्ट करें और अपने एक्सपोर्ट को टाइप करें
- `{variable}` प्लेसहोल्डर्स को बिल्कुल वैसा ही रखें
- ऐरे (`rotatingPhrases`, `progressMessages`) में प्रविष्टियों की संख्या समान होनी चाहिए
- इनका अनुवाद न करें: SnapOtter, JPEG, PNG, WebP, EXIF, API, और अन्य तकनीकी शब्द

### 4. लोकेल रजिस्टर करें (केवल नई भाषा) {#_4-register-the-locale-new-language-only}

अपने लोकेल को `packages/shared/src/i18n/index.ts` में `SUPPORTED_LOCALES` में जोड़ें:

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

`main` के विरुद्ध `feat(i18n): add Swedish translation` या `fix(i18n): correct German typos` जैसे शीर्षक के साथ एक PR खोलें। CLA बॉट आपके पहले योगदान पर आपसे साइन करने के लिए कहेगा।

## नई अनुवाद keys जोड़ना {#adding-new-translation-keys}

जब कोई नई सुविधा जोड़ते हैं जिसके लिए नई UI स्ट्रिंग्स की आवश्यकता होती है:

1. पहले `en.ts` (संदर्भ फ़ाइल) में नई keys जोड़ें
2. `pnpm typecheck` चलाएँ - नई key गायब होने पर हर लोकेल फ़ाइल विफल हो जाएगी
3. सभी लोकेल फ़ाइलों में नई key जोड़ें (अस्थायी फ़ॉलबैक के रूप में अंग्रेज़ी का उपयोग करें)

## कॉन्फ़िगरेशन {#configuration}

एनवायरनमेंट वेरिएबल के माध्यम से इंस्टेंस डिफ़ॉल्ट भाषा सेट करें:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## फ़ाइल संदर्भ {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | अंग्रेज़ी स्ट्रिंग्स (संदर्भ लोकेल, ~1500 keys) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, टाइप एक्सपोर्ट्स |
| `packages/shared/src/i18n/<locale>.ts` | प्रति-भाषा अनुवाद फ़ाइलें |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` हुक |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` हेल्पर्स |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` पब्लिक एंडपॉइंट |

## वेबसाइट, डॉक्स और API संदर्भ का अनुवाद करना {#translating-the-web-surfaces}

ऊपर बताया गया 21-भाषा समर्थन **ऐप** को कवर करता है। सार्वजनिक वेबसाइट
(snapotter.com), यह डॉक्युमेंटेशन साइट, और REST API संदर्भ भी सभी 21 भाषाओं में
अनुवादित हैं, एक अलग हैश-गेटेड पाइपलाइन द्वारा जो `packages/shared/src/i18n` से समान टूल नाम और विवरण
का पुनः उपयोग करती है, ताकि हर जगह शब्दावली एकसमान बनी रहे।

### डिफ़ॉल्ट रूप से मशीन-अनुवादित {#machine-translated-by-default}

वेबसाइट और डॉक्स पर हर ग़ैर-अंग्रेज़ी पेज पहले पास में **मशीन-अनुवादित** होता है
(एक Claude Code सत्र द्वारा, किसी तीसरे-पक्ष सेवा द्वारा नहीं) और ऐसा कहने वाला एक
छोटा, ख़ारिज करने योग्य बैनर रखता है, जिसमें यहाँ वापस एक लिंक होता है। यह जानबूझकर किया गया है:
यह सभी 21 भाषाओं को तेज़ी से और ईमानदारी से भेजता है, फिर समुदाय को उन पेजों को परिष्कृत करने के लिए
आमंत्रित करता है जो सबसे अधिक मायने रखते हैं। मशीन अनुवाद अर्थ को पहुँचा देता है;
मानव समीक्षा इसे स्वाभाविक रूप से पढ़ने योग्य बनाती है।

### पाइपलाइन यह कैसे तय करती है कि किसका अनुवाद करना है {#how-the-web-pipeline-decides}

अंग्रेज़ी स्रोत की हर अनुवाद-योग्य इकाई को हैश किया जाता है, और हैश को उसके अनुवाद के
बग़ल में संग्रहीत किया जाता है। हर बार चलने पर पाइपलाइन:

- किसी भी ऐसी इकाई का अनुवाद करती है जिसका अभी तक कोई अनुवाद नहीं है,
- किसी भी ऐसी इकाई को छोड़ देती है जिसका संग्रहीत हैश अभी भी अंग्रेज़ी स्रोत से मेल खाता है,
- किसी **मशीन** इकाई का पुनः अनुवाद करती है जब उसका अंग्रेज़ी स्रोत बदलता है,
- और किसी **मानव**-परिष्कृत इकाई को `stale` (समीक्षा की आवश्यकता) के रूप में फ़्लैग करती है जब उसका अंग्रेज़ी
  स्रोत बदलता है, आपके काम को अधिलेखित करने के बजाय।

### PR के माध्यम से किसी वेब अनुवाद को परिष्कृत करना {#refining-a-web-translation-by-pr}

आप किसी वेबसाइट, डॉक्स, या API-संदर्भ अनुवाद को उसी तरह सुधारते हैं जैसे आप
किसी ऐप लोकेल को सुधारते हैं: जनरेट की गई फ़ाइल को संपादित करके और एक PR खोलकर।

1. अपनी भाषा के लिए जनरेट किया गया अनुवाद खोजें:
   - वेबसाइट UI स्ट्रिंग्स: `apps/landing/src/i18n/<locale>.json`
   - एक डॉक्स पेज: `apps/docs/<locale>/**.md`
   - API संदर्भ: `apps/api/src/openapi.<locale>.yaml`
2. टेक्स्ट संपादित करें। कोड, लिंक, `{placeholders}`, और किसी भी `⸤I18N…⸥` मार्कर को
   बिल्कुल वैसा ही रखें जैसे वे हैं; पाइपलाइन का वैलिडेटर ऐसे अनुवाद को अस्वीकार करता है जो उन्हें छोड़
   देता है या पुनः क्रमबद्ध करता है।
3. एक PR खोलें। किसी इकाई को संपादित करने से उसकी प्रोवेनेंस `machine` से `human` में बदल जाती है, इसलिए
   पाइपलाइन बाद के किसी रन पर उसे **कभी अधिलेखित नहीं करेगी**। यदि उसके बाद अंग्रेज़ी स्रोत
   बदलता है, तो आपकी इकाई को चुपचाप बदलने के बजाय समीक्षा के लिए `stale` फ़्लैग किया जाता है।

कोड सबमिट किए बिना किसी ग़लत अनुवाद की रिपोर्ट करने के लिए, पेज
URL, भाषा, ग़लत टेक्स्ट, और अपने सुझाए गए सुधार के साथ एक
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) खोलें।

::: tip 
मेंटेनर अनुवाद पाइपलाइन चलाते हैं; योगदान देने के लिए आपको API key की आवश्यकता नहीं है।
बस जनरेट की गई फ़ाइल को संपादित करें और एक PR खोलें। पाइपलाइन कैसे चलती है, इसके लिए
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
देखें।
:::
