---
description: "Excel, OpenDocument ve CSV formatları arasında dönüştürün."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 55115c756f5b
---

# Convert Spreadsheet {#convert-spreadsheet}

Hesap tablolarını Excel (XLSX), OpenDocument Spreadsheet (ODS) ve CSV formatları arasında dönüştürün. Çok sayfalı çalışma kitapları CSV'ye dönüştürülürken ilk sayfayı dışa aktarır.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Bir Excel/ODS/CSV dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Çıktı formatı: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
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
- Çok sayfalı bir çalışma kitabını CSV'ye dönüştürürken yalnızca ilk sayfa dışa aktarılır.
- Formüller değerlendirilir ve CSV çıktısında statik değerler olarak dışa aktarılır.
- Çıktı formatı giriş formatından farklı olmalıdır.
