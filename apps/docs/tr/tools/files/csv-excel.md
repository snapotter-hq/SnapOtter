---
description: "CSV ve Excel (XLSX) arasında her iki yönde dönüştürün."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 2e5f45dbd8d8
---

# CSV to Excel {#csv-to-excel}

CSV ve Excel (XLSX) formatları arasında her iki yönde dönüştürün. XLSX almak için bir CSV veya TSV dosyası yükleyin veya CSV almak için bir XLSX dosyası yükleyin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Bir CSV, TSV veya XLSX dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | XLSX'ten dönüştürürken dışa aktarılacak çalışma sayfası numarası (min 1) |

## Example Request {#example-request}

CSV'den Excel'e:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel'den CSV'ye:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- Dönüştürme yönü giriş dosyası uzantısından otomatik olarak algılanır: `.csv` veya `.tsv` `.xlsx` üretir ve `.xlsx` `.csv` üretir.
- `sheet` parametresi yalnızca XLSX'ten dönüştürürken geçerlidir. Hangi çalışma sayfasının dışa aktarılacağını seçer.
- TSV (sekme ile ayrılmış değerler) dosyaları CSV ile birlikte desteklenir.
