---
description: "Bir görüntüden baskın renkleri renk paleti olarak çıkarın."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: e9020e04ff8f
---

# Renk Paleti {#color-palette}

Bir görüntüden baskın renkleri çıkarın ve bunları hex renk değerleri olarak döndürün. En belirgin ve görsel olarak farklı renkleri tanımlamak için kuantize edilmiş frekans analizi kullanır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Bir görüntü dosyası ve isteğe bağlı bir JSON `settings` alanı ile çok parçalı form verilerini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| count | integer | Hayır | `8` | Çıkarılacak renk sayısı (2-16) |
| format | string | Hayır | `"hex"` | Renk biçimi: `hex`, `rgb`, `hsl` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Yanıt Alanları {#response-fields}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| filename | string | Temizlenmiş dosya adı |
| colors | array | İstenen biçimdeki renk dizeleri dizisi, baskınlığa göre sıralanmış (en sık olan ilk) |
| hex | array | Hex renk dizeleri dizisi (`format` ayarından bağımsız olarak her zaman hex) |
| count | number | Çıkarılan renk sayısı |

## Notlar {#notes}

- Baskınlığa göre sıralanmış en fazla `count` baskın renk döndürür (varsayılan 8, aralık 2-16), frekansa göre (en yaygın olan ilk).
- Görüntü, analiz için dahili olarak 100x100 piksele yeniden boyutlandırılır, bu nedenle palet küçük ayrıntılardan ziyade genel renk dağılımını temsil eder.
- Renkler, piksel popülasyonlarını en geniş aralığa sahip kanal boyunca özyinelemeli olarak bölen medyan kesme kuantizasyonu kullanılarak çıkarılır.
- Analizden önce alfa kanalı kaldırılır, bu nedenle saydam alanlar dikkate alınmaz.
- Bu salt okunur bir uç noktadır. İndirilebilir bir çıktı dosyası veya `jobId` üretmez.
- HEIC, RAW, PSD ve SVG girişleri analizden önce otomatik olarak çözülür.
