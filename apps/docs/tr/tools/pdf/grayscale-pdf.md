---
description: "Bir PDF'teki tüm renkleri gri tonlamaya dönüştürün."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: a394aa07674e
---

# PDF Gri Tonlama {#grayscale-pdf}

Bir PDF'teki tüm renkleri gri tonlamaya dönüştürerek belgenin siyah beyaz bir sürümünü üretin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Bir PDF dosyası içeren multipart form verisini kabul eder. `settings` alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın ayar parametreleri yoktur. PDF dosyasını doğrudan yükleyin.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notlar {#notes}

- Tüm renk uzayları (RGB, CMYK), gömülü görüntüler, vektör grafikleri ve metin dahil gri tonlamaya dönüştürülür.
- Gri tonlama verileri piksel başına daha az bayt gerektirdiğinden, çıktı dosyası genellikle orijinalden daha küçüktür.
