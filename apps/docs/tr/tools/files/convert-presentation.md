---
description: "PowerPoint ve OpenDocument sunum formatları arasında dönüştürün."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 2aa4ad2ee270
---

# Convert Presentation {#convert-presentation}

Sunumları PowerPoint (PPTX) ve OpenDocument Presentation (ODP) formatları arasında dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Bir PowerPoint/ODP dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Çıktı formatı: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

`202 Accepted` döndürür. İlerlemeyi `/api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden izleyin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Kabul edilen giriş formatları: `.pptx`, `.ppt`, `.odp`.
- Dönüştürme, sunucuda başsız (headless) çalışan LibreOffice tarafından gerçekleştirilir.
- Animasyonlar ve geçiş efektleri formatlar arasında korunmayabilir.
- Çıktı formatı giriş formatından farklı olmalıdır.
