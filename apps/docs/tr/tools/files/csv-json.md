---
description: "CSV ve JSON arasında her iki yönde dönüştürün."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 5693d0fb5b7d
---

# CSV to JSON {#csv-to-json}

CSV ve JSON formatları arasında her iki yönde dönüştürün. Bir nesne dizisi olan JSON almak için bir CSV veya TSV dosyası yükleyin veya bir CSV dosyası almak için bir JSON dizisi yükleyin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Bir CSV, TSV veya JSON dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | JSON çıktısını girintileme ile düzenli yazdır |

## Example Request {#example-request}

CSV'den JSON'a:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON'dan CSV'ye:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- Dönüştürme yönü giriş dosyası uzantısından otomatik olarak algılanır: `.csv` veya `.tsv` `.json` üretir ve `.json` `.csv` üretir.
- `pretty` parametresi yalnızca JSON çıktısını etkiler. `false` olarak ayarlandığında, çıktı kompakt tek satırlık bir JSON dizesidir.
- JSON girişi tutarlı anahtarlara sahip nesnelerden oluşan bir dizi olmalıdır. Her nesne bir satıra dönüşür ve her anahtar bir sütun başlığına dönüşür.
- TSV (sekme ile ayrılmış değerler) dosyaları CSV ile birlikte desteklenir.
