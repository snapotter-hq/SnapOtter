---
description: "Gömülü görüntüleri sıkıştırarak PDF dosya boyutunu küçültün."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 1de4577fd383
---

# PDF Sıkıştır {#compress-pdf}

Gömülü görüntüleri örnekleme oranını düşürerek PDF dosya boyutunu azaltın. Bir kalite kaydırıcısı ile bir hedef dosya boyutu arasında seçim yapın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| mode | string | Hayır | `"quality"` | Sıkıştırma modu: `quality` veya `targetSize` |
| quality | integer | Hayır | `75` | Sıkıştırma kalitesi, 1-100 (yüksek = daha az sıkıştırma). `quality` modunda kullanılır |
| targetSizeKb | number | Hayır | - | Kilobayt cinsinden hedef dosya boyutu. `targetSize` modunda kullanılır |

## Örnek İstek {#example-request}

Kaliteye göre sıkıştırın:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Bir hedef boyuta sıkıştırın:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notlar {#notes}

- `quality` modunda, daha düşük değerler daha fazla görüntü bozulmasıyla daha küçük dosyalar üretir.
- `targetSize` modunda, ikili arama istenen boyuta sığan en yüksek DPI değerini bulur.
- Sıkıştırma dosyayı büyütecekse, orijinal baytlar değiştirilmeden döndürülür.
- Metin ve vektör içeriği etkilenmez; yalnızca gömülü raster görüntülerin örnekleme oranı düşürülür.
