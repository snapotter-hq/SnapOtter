---
description: "CSV veya JSON verilerinden çubuk, çizgi veya pasta grafikleri oluşturun."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: a440e544d68e
---

# Chart Maker {#chart-maker}

CSV veya JSON verilerinden çubuk, çizgi veya pasta grafikleri oluşturun. İşlenmiş grafiğin PNG görüntüsünü döndürür.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Bir CSV veya JSON dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | Grafik türü: `bar`, `line`, `pie` |
| title | string | No | - | Grafik başlığı (maks. 120 karakter) |
| width | integer | No | `960` | Piksel cinsinden grafik genişliği (320-2048) |
| height | integer | No | `540` | Piksel cinsinden grafik yüksekliği (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- Giriş bir `.csv` veya `.json` dosyası olmalıdır. CSV dosyalarında sütun adlarını içeren bir başlık satırı bulunmalıdır.
- İlk sütun kategori etiketi olarak kullanılır; ikinci sütun sayısal olmalı ve veri değerlerini sağlamalıdır. Yalnızca iki sütun kullanılır.
- JSON girişi bir `{label, value}` nesneleri dizisi veya anahtarları etiketlere ve değerleri veri noktalarına dönüşen düz bir nesne olmalıdır.
- Maksimum 100 veri noktası. Tüm değerler sıfır veya daha büyük olmalıdır.
- Giriş formatından bağımsız olarak çıktı her zaman bir PNG görüntüsüdür.
