---
description: "Hesap tablolarını PDF'e dönüştürün."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: d9590e956277
---

# Excel to PDF {#excel-to-pdf}

Excel, OpenDocument veya CSV hesap tablolarını PDF'e dönüştürün. Geniş sayfalar birden fazla sayfaya bölünebilir.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Bir Excel/ODS/CSV dosyası içeren multipart form verisi kabul eder.

## Parameters {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir hesap tablosu yükleyin ve PDF'e dönüştürülecektir.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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

- Kabul edilen giriş formatları: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Geniş sayfalar sonuçtaki PDF'te birden fazla sayfaya bölünebilir.
- Grafikler ve koşullu biçimlendirme PDF çıktısında işlenir.
- Dönüştürme, sunucuda başsız (headless) çalışan LibreOffice tarafından gerçekleştirilir.
