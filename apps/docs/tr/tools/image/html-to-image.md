---
description: "Web sayfalarını veya HTML parçacıklarını cihaz emülasyonuyla yüksek kaliteli görseller olarak yakalayın."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 2cb79b9eabb8
---

# HTML'den Görsele {#html-to-image}

Bir web sayfası URL'sini veya ham HTML içeriğini bir ekran görüntüsü görseli olarak yakalayın. Cihaz emülasyonunu (masaüstü, tablet, mobil), tam sayfa yakalamayı ve birden fazla çıktı biçimini destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Bir **JSON gövdesi** kabul eder (multipart değil). Dosya yüklemesi gerekmez.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| url | string | Koşullu | - | Yakalanacak URL (geçerli bir URL olmalıdır) |
| html | string | Koşullu | - | İşlenecek ham HTML içeriği (1 ile 5.000.000 karakter arası) |
| format | string | Hayır | `"png"` | Çıktı biçimi: `jpg`, `png`, `webp` |
| quality | number | Hayır | `90` | Kayıplı biçimler için çıktı kalitesi (1 ile 100 arası) |
| fullPage | boolean | Hayır | `false` | Yalnızca görünüm alanını değil, kaydırılabilir tüm sayfayı yakala |
| devicePreset | string | Hayır | `"desktop"` | Cihaz emülasyonu: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Hayır | `1280` | Piksel cinsinden özel görünüm alanı genişliği (320 ile 3840 arası, devicePreset `custom` olduğunda kullanılır) |
| viewportHeight | number | Hayır | `720` | Piksel cinsinden özel görünüm alanı yüksekliği (320 ile 2160 arası, devicePreset `custom` olduğunda kullanılır) |

`url` veya `html` değerinden biri sağlanmalıdır, ancak ikisi birden değil.

### Cihaz Ön Ayarları {#device-presets}

| Ön Ayar | Genişlik | Yükseklik | Mobil UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Hayır |
| `tablet` | 768 | 1024 | Hayır |
| `mobile` | 375 | 812 | Evet |
| `custom` | (kullanıcı tarafından belirtilir) | (kullanıcı tarafından belirtilir) | Hayır |

## Örnek İstek {#example-request}

Bir web sayfası yakalama:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

HTML içeriği işleme:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Notlar {#notes}

- Sunucuda Chromium'un kurulu olmasını gerektirir. Tarayıcı hizmeti mevcut değilse HTTP 503 döndürür.
- URL'ler SSRF saldırılarına karşı doğrulanır (özel/dahili ağ adresleri engellenir).
- Bu uç nokta saatte 120 istekle sınırlıdır.
- Bu araç URL'lerden/HTML'den görsel ürettiği için `originalSize` her zaman 0'dır.
- Çıktı dosya adı `screenshot.<format>` şeklindedir.
- Sayfanın yüklenmesi çok uzun sürerse istek HTTP 504 (ağ geçidi zaman aşımı) döndürür.
- Tarayıcı hizmeti tekrar tekrar çökerse geçici olarak devre dışı bırakılır ve `BROWSER_CRASHED` koduyla HTTP 503 döndürür.
