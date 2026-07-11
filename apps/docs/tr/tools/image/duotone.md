---
description: "Özel gölge ve vurgu renkleriyle iki renkli düoton efekti uygulayın."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 93af611c3932
---

# Düoton {#duotone}

Bir görüntüye iki renkli düoton efekti uygulayın. Görüntü gri tonlamaya dönüştürülür, ardından gölge rengi (koyu tonlar) ile vurgu rengi (parlak tonlar) arasında bir gradyana eşlenir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Bir görüntü dosyası ve bir JSON `settings` alanı ile çok parçalı form verilerini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| shadow | string | Hayır | `"#1e3a8a"` | Gölge hex rengi (koyu tonlara uygulanır) |
| highlight | string | Hayır | `"#fbbf24"` | Vurgu hex rengi (parlak tonlara uygulanır) |
| intensity | integer | Hayır | `100` | Efekt yoğunluğu (0-100); 0 orijinali döndürür, 100 tam düotonu uygular |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notlar {#notes}

- Çıktı biçimi giriş biçimiyle eşleşir. HEIC, RAW, PSD ve SVG girişleri işlenmeden önce otomatik olarak çözülür.
- 100'den küçük bir `intensity`, düoton sonucunu orijinal görüntüyle harmanlar ve daha ince efektlere olanak tanır.
- Popüler düoton kombinasyonları arasında lacivert/altın, deniz mavisi/mercan ve mor/pembe yer alır.
