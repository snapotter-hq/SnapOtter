---
description: "Birden fazla dosyayı tek bir ZIP arşivinde birleştirin."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: 126dafa4d400
---

# Create ZIP {#create-zip}

Herhangi bir türdeki birden fazla dosyayı tek bir ZIP arşivinde birleştirin. Yinelenen dosya adları otomatik olarak tekilleştirilir.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

İki veya daha fazla dosya içeren multipart form verisi kabul eder. Bir ayarlar alanı gerekmez.

## Parameters {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Birleştirmek için herhangi bir türde 2-50 dosya yükleyin.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 2 ile 50 arasında giriş dosyası gerektirir.
- Herhangi bir dosya türü kabul edilir; giriş formatında herhangi bir kısıtlama yoktur.
- Birden fazla dosya aynı adı paylaşıyorsa, sayısal soneklerle otomatik olarak tekilleştirilir.
- Çıktı arşivi standart ZIP sıkıştırması (deflate) kullanır.
