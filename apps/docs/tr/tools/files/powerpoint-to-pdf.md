---
description: "Sunumları PDF'e dönüştürün."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 201bb323eeca
---

# PowerPoint'ten PDF'e {#powerpoint-to-pdf}

PowerPoint veya OpenDocument sunumlarını, her slayt bir sayfa olacak şekilde PDF'e dönüştürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Bir PowerPoint/ODP dosyası içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir sunum yükleyin, PDF'e dönüştürülecektir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Örnek Yanıt {#example-response}

`202 Accepted` döndürür. İlerlemeyi SSE üzerinden `/api/v1/jobs/{jobId}/progress` adresinden takip edin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notlar {#notes}

- Kabul edilen giriş biçimleri: `.pptx`, `.ppt`, `.odp`.
- Her slayt PDF'te bir sayfa olur.
- Dönüştürme, sunucuda başsız (headless) çalışan LibreOffice tarafından gerçekleştirilir.
- Animasyonlar ve geçişler PDF çıktısına dahil edilmez.
