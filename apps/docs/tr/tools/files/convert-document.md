---
description: "Word, OpenDocument, RTF ve düz metin formatları arasında dönüştürün."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 18c7b8914520
---

# Convert Document {#convert-document}

LibreOffice kullanarak belgeleri Word (DOCX), OpenDocument (ODT), RTF ve düz metin formatları arasında dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Bir Word/ODT/RTF/TXT dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Çıktı formatı: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Kabul edilen giriş formatları: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Dönüştürme, sunucuda başsız (headless) çalışan LibreOffice tarafından gerçekleştirilir.
- Karmaşık biçimlendirme (makrolar, gömülü nesneler) formatlar arasında dönüştürmede korunmayabilir.
- Çıktı formatı giriş formatından farklı olmalıdır.
