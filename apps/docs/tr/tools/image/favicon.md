---
description: "Bir kaynak görselden tüm standart favicon ve uygulama simgesi boyutlarını üretin."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 71f31617b96d
---

# Favicon Üretici {#favicon-generator}

Bir kaynak görselden eksiksiz bir favicon ve uygulama simgesi dosyaları seti üretin. Tarayıcılar, Apple cihazları ve Android için gereken tüm standart boyutları, bir web manifestosu ve bir HTML parçacığıyla birlikte üretir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Bir veya daha fazla görsel dosyası ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| background | string | Hayır | - | Arka plan hex rengi (örn. `"#ffffff"`). Ayarlandığında simge bu rengin üzerine düzleştirilir. |
| padding | integer | Hayır | `0` | Simge içeriğinin çevresindeki dolgu yüzdesi (0 ile 40 arası) |
| radius | integer | Hayır | `0` | Yuvarlatılmış simgeler için köşe yarıçapı yüzdesi (0 ile 50 arası) |
| sizes | integer[] | Hayır | - | Çıktıyı belirli piksel boyutlarıyla sınırlar (örn. `[16, 32, 180]`). Tüm standart boyutları üretmek için atlayın. |
| themeColor | string | Hayır | `"#ffffff"` | Web manifestosu için tema rengi hex değeri |

## Üretilen Dosyalar {#generated-files}

Her giriş görseli için aşağıdaki dosyalar üretilir:

| Dosya | Boyut | Amaç |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Tarayıcı sekmesi simgesi |
| `favicon-32x32.png` | 32x32 | Tarayıcı sekmesi simgesi (HiDPI) |
| `favicon-48x48.png` | 48x48 | Masaüstü kısayolu |
| `apple-touch-icon.png` | 180x180 | iOS ana ekranı |
| `android-chrome-192x192.png` | 192x192 | Android ana ekranı |
| `android-chrome-512x512.png` | 512x512 | Android açılış ekranı |
| `favicon.ico` | 32x32 | Eski ICO biçimi |
| `manifest.json` | - | Simge referanslarını içeren web uygulaması manifestosu |
| `favicon-snippet.html` | - | Kullanıma hazır HTML link etiketleri |

## Örnek İstek {#example-request}

Yuvarlatılmış köşeler ve dolguya sahip tek kaynak görsel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Birden fazla kaynak görsel (her biri bir alt klasörde kendi setini alır):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Örnek Yanıt {#example-response}

Yanıt, doğrudan akıtılan bir ZIP dosyasıdır. Yanıt başlıkları şunlardır:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Dahil Edilen HTML Parçacığı {#html-snippet-included}

ZIP, HTML `<head>` bölümünüze yapıştırabileceğiniz bir `favicon-snippet.html` dosyası içerir:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Notlar {#notes}

- Kaynak görseller `cover` sığdırma modu kullanılarak yeniden boyutlandırılır; yani her kare boyutu doldurmak için kırpılır. En iyi sonuç için kare bir kaynak görsel kullanın.
- Birden fazla dosya yüklendiğinde, her biri ZIP içinde kendi alt klasörünü alır (kaynak dosyaya göre adlandırılır).
- Tek dosya yüklemesinde, tüm çıktılar alt klasör olmadan ZIP kökünde bulunur.
- Doğrulama veya çözümlemede başarısız olan dosyalar atlanır ve sorunları açıklayan bir `skipped-files.txt` ZIP'e dahil edilir.
- Desteklenen giriş biçimleri: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD ve daha fazlası.
- EXIF yönlendirmesi yeniden boyutlandırmadan önce otomatik olarak uygulanır.
