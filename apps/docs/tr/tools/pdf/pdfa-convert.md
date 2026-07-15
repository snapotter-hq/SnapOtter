---
description: "Uzun süreli koruma için bir PDF'i arşiv PDF/A-2 biçimine dönüştürün."
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: 4d58e80e853a
---

# PDF/A Dönüştürücü {#pdf-a-convert}

Bir PDF'i, uzun süreli koruma ve mevzuata uyum için uygun olan PDF/A-2 arşiv biçimine dönüştürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Bir PDF dosyası içeren multipart form verisini kabul eder. `settings` alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın ayar parametreleri yoktur. PDF dosyasını doğrudan yükleyin.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notlar {#notes}

- Çıktı PDF/A-2 standardına uygundur.
- PDF/A tüm yazı tiplerini gömer ve dış referanslara izin vermez, bu nedenle çıktı dosyası orijinalden daha büyük olabilir.
- Şifreleme ve JavaScript, PDF/A standardı tarafından izin verilmediğinden dönüştürme sırasında çıkarılır.
