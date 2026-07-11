---
description: "Desteklenen 21 dil ve TypeScript ile zorunlu kılınan i18n sistemini kullanarak SnapOtter için nasıl çeviri oluşturulacağı veya iyileştirileceği."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 94aa2d346a74
---

# Çeviri kılavuzu {#translation-guide}

SnapOtter kutudan çıktığı gibi 21 dille gelir. i18n sistemi, TypeScript ile zorunlu kılınan yerel ayar bütünlüğü ve dinamik kod bölme özelliğine sahip hafif, özel bir çalışma zamanı kullanır.

## Desteklenen diller {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | İngilizce | English | LTR |
| `zh-CN` | Çince (Basitleştirilmiş) | 简体中文 | LTR |
| `zh-TW` | Çince (Geleneksel) | 繁體中文 | LTR |
| `ja` | Japonca | 日本語 | LTR |
| `ko` | Korece | 한국어 | LTR |
| `es` | İspanyolca | Español | LTR |
| `fr` | Fransızca | Français | LTR |
| `it` | İtalyanca | Italiano | LTR |
| `pt-BR` | Portekizce (Brezilya) | Português (Brasil) | LTR |
| `de` | Almanca | Deutsch | LTR |
| `nl` | Felemenkçe | Nederlands | LTR |
| `sv` | İsveççe | Svenska | LTR |
| `ru` | Rusça | Русский | LTR |
| `pl` | Lehçe | Polski | LTR |
| `uk` | Ukraynaca | Українська | LTR |
| `ar` | Arapça | العربية | RTL |
| `tr` | Türkçe | Türkçe | LTR |
| `hi` | Hintçe | हिन्दी | LTR |
| `vi` | Vietnamca | Tiếng Việt | LTR |
| `id` | Endonezce | Bahasa Indonesia | LTR |
| `th` | Tayca | ไทย | LTR |

## Dil algılama nasıl çalışır {#how-language-detection-works}

SnapOtter üç katmanlı bir çözümleme sırası kullanır:

1. **Kullanıcı tercihi** - `localStorage("snapotter-locale")` içinde saklanır ve kimlik doğrulaması yapıldığında kullanıcı ayarlarıyla eşitlenir
2. **Tarayıcı otomatik algılama** - `navigator.languages` dizisini BCP 47 önek eşleştirmesiyle dolaşır
3. **Örnek varsayılanı** - yöneticinin `DEFAULT_LOCALE` ortam değişkeni (`GET /api/v1/config/locale` üzerinden getirilir)
4. **İngilizce yedeği** - her zaman kullanılabilir

Kullanıcılar dili şuralardan değiştirebilir:
- **Alt bilgideki Küre seçici** (masaüstü, her zaman görünür)
- **Oturum açma sayfası** dil seçici (kimlik doğrulama öncesi)
- **Ayarlar > Genel** bölümü (kullanıcı başına tercih)
- **Mobil kenar çubuğu** dil açılır menüsü
- **Ayarlar > Sistem** bölümü, örnek genelindeki varsayılanı ayarlar (yalnızca yönetici)

## Çeviriler nasıl çalışır {#how-translations-work}

Tüm arayüz dizeleri `packages/shared/src/i18n/` içinde yer alır. Referans dosyası `en.ts` olup, uygulamanın kullandığı her dizeyi (~1500 anahtar) içeren türlenmiş bir nesne dışa aktarır. Diğer diller, aynı yapıyı dışa aktaran ayrı dosyalardır (örneğin `de.ts`, `fr.ts`).

`TranslationKeys` türü, anahtar yapısını zorunlu kılarken herhangi bir dize değerini kabul etmek için `DeepStringRecord` kullanır. TypeScript, herhangi bir çeviri dosyasındaki eksik anahtarları derleme zamanında yakalar.

Çalışma zamanında yalnızca etkin yerel ayar dinamik `import()` aracılığıyla yüklenir, böylece ana paket küçük kalır.

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

## Bir çeviriye katkıda bulunma {#contributing-a-translation}

Çeviri PR'lerini doğrudan memnuniyetle karşılıyoruz. Mevcut bir yerel ayarı iyileştirebilir veya yeni bir tane ekleyebilirsiniz.

Kod göndermeden bir çeviri hatasını bildirmek için, dili, hatalı dizeyi ve önerilen düzeltmeyi belirterek bir [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) açın.

::: tip 
Çeviri PR'leri önceden onay gerektirmez. Depoyu çatallayın, değişikliklerinizi yapın ve bir PR açın. Tam PR süreci ve CLA gereksinimi için [Katkı Kılavuzu](/tr/guide/contributing) bölümüne bakın.
:::

## Bir çeviriyi nasıl oluşturur veya güncellersiniz {#how-to-create-or-update-a-translation}

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

### 3. Dizeleri çevirin {#_3-translate-the-strings}

Yeni dosyanızı açın ve her dize değerini çevirin. Nesne yapısını ve anahtarları tam olarak aynı tutun.

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
- Nesne anahtarlarını çevirmeyin, yalnızca dize değerlerini çevirin
- `as const` öğesini sonda tutun
- `TranslationKeys` öğesini `./en.js` konumundan içe aktarın ve dışa aktarımınızı türleyin
- `{variable}` yer tutucularını tam olduğu gibi tutun
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

`main` deposuna karşı `feat(i18n): add Swedish translation` veya `fix(i18n): correct German typos` gibi bir başlıkla bir PR açın. CLA botu ilk katkınızda imzalamanızı isteyecektir.

## Yeni çeviri anahtarları ekleme {#adding-new-translation-keys}

Yeni arayüz dizeleri gerektiren yeni bir özellik eklerken:

1. Yeni anahtarları önce `en.ts` (referans dosyası) içine ekleyin
2. `pnpm typecheck` komutunu çalıştırın - yeni anahtar eksikse her yerel ayar dosyası başarısız olur
3. Yeni anahtarı tüm yerel ayar dosyalarına ekleyin (geçici yedek olarak İngilizceyi kullanın)

## Yapılandırma {#configuration}

Örnek varsayılan dilini ortam değişkeni aracılığıyla ayarlayın:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Dosya referansı {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | İngilizce dizeler (referans yerel ayar, ~1500 anahtar) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, tür dışa aktarımları |
| `packages/shared/src/i18n/<locale>.ts` | Dil başına çeviri dosyaları |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` kancası |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` yardımcıları |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` genel uç noktası |

## Web sitesini, belgeleri ve API referansını çevirme {#translating-the-web-surfaces}

Yukarıdaki 21 dil desteği **uygulamayı** kapsar. Herkese açık web sitesi
(snapotter.com), bu belge sitesi ve REST API referansı da, terminolojinin her
yerde tutarlı kalması için `packages/shared/src/i18n` kaynağındaki aynı araç adlarını ve
açıklamalarını yeniden kullanan ayrı bir hash denetimli işlem hattı tarafından
21 dilin tümüne çevrilir.

### Varsayılan olarak makine tarafından çevrilir {#machine-translated-by-default}

Web sitesindeki ve belgelerdeki İngilizce olmayan her sayfa ilk geçişte
**makine tarafından çevrilir** (üçüncü taraf bir hizmet tarafından değil, bir
Claude Code oturumu tarafından) ve bunu belirten, buraya geri bağlantı içeren
küçük, kapatılabilir bir başlık taşır. Bu bilinçli bir tercihtir: 21 dilin
tümünü hızlı ve dürüst bir şekilde sunar, ardından topluluğu en önemli sayfaları
rafine etmeye davet eder. Makine çevirisi anlamı aktarır; insan incelemesi ise
metnin doğal okunmasını sağlar.

### İşlem hattı neyi çevireceğine nasıl karar verir {#how-the-web-pipeline-decides}

Her çevrilebilir İngilizce kaynak birimi hash'lenir ve hash, çevirisinin yanında
saklanır. Her çalıştırmada işlem hattı:

- henüz çevirisi olmayan her birimi çevirir,
- saklanan hash'i hâlâ İngilizce kaynakla eşleşen her birimi atlar,
- İngilizce kaynağı değiştiğinde bir **makine** birimini yeniden çevirir,
- ve bir **insan** tarafından rafine edilmiş bir birimi, İngilizce kaynağı
  değiştiğinde çalışmanızın üzerine yazmak yerine `stale` (inceleme gerekir)
  olarak işaretler.

### Bir web çevirisini PR ile rafine etme {#refining-a-web-translation-by-pr}

Bir web sitesi, belge veya API referansı çevirisini, bir uygulama yerel ayarını
iyileştirdiğiniz şekilde iyileştirirsiniz: oluşturulan dosyayı düzenleyerek ve
bir PR açarak.

1. Dilinize ait oluşturulan çeviriyi bulun:
   - web sitesi arayüz dizeleri: `apps/landing/src/i18n/<locale>.json`
   - bir belge sayfası: `apps/docs/<locale>/**.md`
   - API referansı: `apps/api/src/openapi.<locale>.yaml`
2. Metni düzenleyin. Kodu, bağlantıları, `{placeholders}` ve tüm `⸤I18N…⸥` işaretlerini
   tam olduğu gibi tutun; işlem hattının doğrulayıcısı, bunları düşüren veya
   yeniden sıralayan bir çeviriyi reddeder.
3. Bir PR açın. Bir birimi düzenlemek, kaynağını `machine` konumundan `human`
   konumuna çevirir, böylece işlem hattı daha sonraki bir çalıştırmada onun
   **asla üzerine yazmaz**. İngilizce kaynak sonradan değişirse, biriminiz
   sessizce değiştirilmek yerine inceleme için `stale` olarak işaretlenir.

Kod göndermeden bir çeviri hatasını bildirmek için, sayfa URL'sini, dili,
hatalı metni ve önerilen düzeltmenizi belirterek bir
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) açın.

::: tip 
Çeviri işlem hattını bakım yapanlar çalıştırır; katkıda bulunmak için bir API
anahtarına ihtiyacınız yoktur. Yalnızca oluşturulan dosyayı düzenleyin ve bir PR
açın. İşlem hattının nasıl çalıştığı için
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md) bölümüne bakın.
:::