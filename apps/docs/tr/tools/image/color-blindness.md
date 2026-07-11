---
description: "Görüntülerin farklı renk görme eksikliği türlerine sahip kişilere nasıl göründüğünü simüle edin."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 5e095aa656b4
---

# Renk Körlüğü Simülasyonu {#color-blindness-simulation}

Görüntülerin çeşitli renk körlüğü türlerine sahip kişilere nasıl göründüğünü önizlemek için renk görme eksikliğini (CVD) simüle edin. Tasarımların, grafiklerin ve arayüzün erişilebilirlik testi için kullanışlıdır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Bir görüntü dosyası ve bir JSON `settings` alanı ile çok parçalı form verilerini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| simulationType | string | Hayır | `"deuteranomaly"` | Simüle edilecek renk görme eksikliği türü |

### Simülasyon Türleri {#simulation-types}

| Değer | Durum | Açıklama |
|-------|-----------|-------------|
| `protanopia` | Kırmızı körü | Kırmızı koni hücrelerinin tamamen yokluğu |
| `deuteranopia` | Yeşil körü | Yeşil koni hücrelerinin tamamen yokluğu |
| `tritanopia` | Mavi körü | Mavi koni hücrelerinin tamamen yokluğu |
| `protanomaly` | Kırmızı zayıf | Azalmış kırmızı koni duyarlılığı |
| `deuteranomaly` | Yeşil zayıf | Azalmış yeşil koni duyarlılığı (en yaygın) |
| `tritanomaly` | Mavi zayıf | Azalmış mavi koni duyarlılığı |
| `achromatopsia` | Tam renk körü | Renk görmenin tamamen yokluğu |
| `blueConeMonochromacy` | Yalnızca mavi koni | Yalnızca mavi koniler işlevsel |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notlar {#notes}

- Döteranomali (yeşil zayıf) varsayılan olandır çünkü en yaygın renk görme eksikliği biçimidir ve erkeklerin yaklaşık %6'sını etkiler.
- Simülasyon, azalmış veya yok olan koni fotoreseptörlerinin algılanan renkleri nasıl değiştirdiğini modelleyen renk dönüşüm matrislerini kullanır.
- Bu araç tahribatsızdır ve yalnızca bir önizleme üretir. Erişilebilirlik için orijinal görüntüyü değiştirmez.
- Çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girişleri işlenmeden önce otomatik olarak çözülür.
