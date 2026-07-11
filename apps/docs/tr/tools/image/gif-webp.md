---
description: "Animasyonlu GIF'i WebP'ye ve tersine dönüştürün, tüm kareleri koruyun."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 11464ec15f94
---

# GIF/WebP Dönüştürücü {#gif-webp-converter}

Animasyonlu GIF dosyalarını WebP'ye ve tersine dönüştürün; tüm kareleri ve animasyon zamanlamasını koruyun. WebP animasyonları genellikle eşdeğer GIF'lerden %25-35 daha küçüktür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Bir GIF veya WebP dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| quality | integer | Hayır | `80` | WebP kodlaması için çıktı kalitesi (1-100) |
| lossless | boolean | Hayır | `false` | Kayıpsız WebP sıkıştırması kullan |
| resizePercent | integer | Hayır | `100` | Çıktıyı yüzdeye göre ölçeklendir (10-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Notlar {#notes}

- Yalnızca `.gif` ve `.webp` dosyaları kabul edilir. Diğer görsel biçimleri bu araç tarafından desteklenmez.
- Dönüştürme yönü otomatiktir: GIF girişi WebP çıktısı üretir, WebP girişi ise GIF çıktısı üretir.
- `quality` ve `lossless` seçenekleri yalnızca WebP'ye kodlarken geçerlidir. GIF'e dönüştürürken çıktı, standart GIF paletini kullanır.
- Büyük animasyonların boyutlarını (ve dosya boyutunu) azaltmak için `resizePercent` kullanın.
