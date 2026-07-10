---
description: "SnapOtter için desteklenen 21 dil ve TypeScript zorunlu i18n sistemini kullanarak çeviri oluşturma veya iyileştirme."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: dd25a9aa5264
---

# Çeviri kılavuzu {#translation-guide}

SnapOtter kutudan çıktığı gibi 21 dille gelir. i18n sistemi, TypeScript zorunlu yerel ayar (locale) eksiksizliği ve dinamik kod bölme (code-splitting) sağlayan hafif bir özel çalışma zamanı kullanır.

## Desteklenen diller {#supported-languages}

| Kod | Dil | Yerel Ad | Yön |
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

## Dil algılama nasıl çalışır {#how-language-detection-works}

SnapOtter üç katmanlı bir çözümleme sırası kullanır:

1. **Kullanıcı tercihi** - `localStorage("snapotter-locale")` içinde saklanır ve kimlik doğrulaması yapıldığında kullanıcı ayarlarıyla senkronize edilir
2. **Tarayıcı otomatik algılama** - `navigator.languages` dizisini BCP 47 önek eşleştirmesiyle tarar
3. **Örnek varsayılanı** - yöneticinin `DEFAULT_LOCALE` ortam değişkeni (`GET /api/v1/config/locale` üzerinden alınır)
4. **İngilizce yedeği** - her zaman kullanılabilir

Kullanıcılar dili şuralardan değiştirebilir:
- **Alt bilgi Küre (Globe) seçici** (masaüstü, her zaman görünür)
- **Giriş sayfası** dil seçicisi (kimlik doğrulaması öncesi)
- **Ayarlar > Genel** bölümü (kullanıcı başına tercih)
- **Mobil kenar çubuğu** dil açılır menüsü
- **Ayarlar > Sistem** bölümü, örnek genelindeki varsayılanı belirler (yalnızca yönetici)

## Çeviriler nasıl çalışır {#how-translations-work}

Tüm arayüz metinleri `packages/shared/src/i18n/` içinde bulunur. Referans dosyası `en.ts` olup, uygulamanın kullandığı her metni (~1500 anahtar) içeren, türü belirlenmiş bir nesne dışa aktarır. Diğer diller aynı yapıyı dışa aktaran ayrı dosyalardır (ör. `de.ts`, `fr.ts`).

`TranslationKeys` türü, anahtar yapısını zorunlu kılarken herhangi bir metin değerini kabul etmek için `DeepStringRecord` kullanır. TypeScript, herhangi bir çeviri dosyasındaki eksik anahtarları derleme zamanında yakalar.

Çalışma zamanında yalnızca etkin yerel ayar, dinamik `import()` aracılığıyla yüklenir; bu da ana paketi (bundle) küçük tutar.

## Çevirileri bileşenlerde kullanma {#using-translations-in-components}

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

## Çeviriye katkıda bulunma {#contributing-a-translation}

Çeviri PR'lerini doğrudan memnuniyetle karşılıyoruz. Mevcut bir yerel ayarı iyileştirebilir veya yenisini ekleyebilirsiniz.

Kod göndermeden bir çeviri hatası bildirmek için dili, hatalı metni ve önerilen düzeltmeyi içeren bir [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) açın.

::: tip 
Çeviri PR'leri önceden onay gerektirmez. Depoyu çatallayın (fork), değişikliklerinizi yapın ve bir PR açın. PR sürecinin tamamı ve CLA gereksinimi için [Katkı Kılavuzu](/tr/guide/contributing) bölümüne bakın.
:::

## Bir çeviri nasıl oluşturulur veya güncellenir {#how-to-create-or-update-a-translation}

### 1. Çatallayın ve klonlayın {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Referans dosyasını kopyalayın (yalnızca yeni dil) {#_2-copy-the-reference-file-new-language-only}

Mevcut bir çeviriyi iyileştiriyorsanız bu adımı atlayın.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Metinleri çevirin {#_3-translate-the-strings}

Yeni dosyanızı açın ve her metin değerini çevirin. Nesne yapısını ve anahtarları tam olarak aynı tutun.

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

Kurallar:
- Nesne anahtarlarını çevirmeyin, yalnızca metin değerlerini çevirin
- `as const` öğesini sonda tutun
- `./en.js` dosyasından `TranslationKeys` öğesini içe aktarın ve dışa aktarmanızın türünü belirtin
- `{variable}` yer tutucularını olduğu gibi tutun
- Diziler (`rotatingPhrases`, `progressMessages`) aynı sayıda girdiye sahip olmalıdır
- Şunları çevirmeyin: SnapOtter, JPEG, PNG, WebP, EXIF, API ve diğer teknik terimler

### 4. Yerel ayarı kaydedin (yalnızca yeni dil) {#_4-register-the-locale-new-language-only}

Yerel ayarınızı `packages/shared/src/i18n/index.ts` içindeki `SUPPORTED_LOCALES` öğesine ekleyin:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Doğrulayın {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Gönderin {#_6-submit}

`main` üzerine `feat(i18n): add Swedish translation` veya `fix(i18n): correct German typos` gibi bir başlıkla bir PR açın. CLA botu, ilk katkınızda sizden imzalamanızı isteyecektir.

## Yeni çeviri anahtarları ekleme {#adding-new-translation-keys}

Yeni arayüz metinleri gerektiren yeni bir özellik eklerken:

1. Yeni anahtarları önce `en.ts` dosyasına ekleyin (referans dosyası)
2. `pnpm typecheck` komutunu çalıştırın - yeni anahtar eksik olan her yerel ayar dosyası başarısız olur
3. Yeni anahtarı tüm yerel ayar dosyalarına ekleyin (geçici bir yedek olarak İngilizceyi kullanın)

## Yapılandırma {#configuration}

Örnek varsayılan dilini ortam değişkeni aracılığıyla ayarlayın:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Dosya referansı {#file-reference}

| Dosya | Amaç |
|------|---------|
| `packages/shared/src/i18n/en.ts` | İngilizce metinler (referans yerel ayarı, ~1500 anahtar) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, tür dışa aktarımları |
| `packages/shared/src/i18n/<locale>.ts` | Dil başına çeviri dosyaları |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` kancası (hook) |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` yardımcıları |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` genel uç noktası (endpoint) |
