---
description: "Bir görselden kanal başına istatistiklerle birlikte bir RGB histogram grafiği üretin."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: ec14705067ea
---

# Histogram {#histogram}

Bir görselden bir RGB histogram grafiği üretin. Yanıt JSON'unda kanal başına istatistikler ve ham 256 bölmeli histogram verileriyle birlikte bir PNG histogram görseli döndürür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Bir görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| scale | string | Hayır | `"linear"` | Y ekseni ölçeği: `linear` veya `log` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Notlar {#notes}

- `downloadUrl`, R, G, B ve parlaklık dağılımlarını gösteren, işlenmiş bir PNG histogram grafiğine işaret eder.
- `bins`, her kanal (kırmızı, yeşil, mavi, parlaklık) için özel görselleştirmeler oluşturmaya uygun ham 256 değerli diziler içerir.
- `stats`, kanal başına ortalama, medyan ve standart sapma sağlar.
- `mean` ve `max`, geriye dönük uyumlu kısaltma alanlarıdır.
- Histogram birkaç zirveyle domine edildiğinde ve alt bölmelerdeki ayrıntıyı görmek istediğinizde `log` ölçeğini kullanın.
- HEIC, RAW, PSD ve SVG girişleri analizden önce otomatik olarak çözümlenir.
