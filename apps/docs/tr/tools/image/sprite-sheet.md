---
description: "Kare meta verisiyle birden fazla görüntüyü tek bir sprite sayfası ızgarasında birleştirin."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: a6e4dc2fbf4f
---

# Sprite Sayfası {#sprite-sheet}

Birden fazla görüntüyü tek bir sprite sayfası ızgarasında birleştirin. Her görüntü, ilk görüntünün boyutlarına uyacak şekilde yeniden boyutlandırılır ve ızgaraya yerleştirilir. Kare başına koordinat meta verisiyle birlikte sprite sayfası görüntüsünü döndürür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

İki veya daha fazla görüntü dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| columns | integer | Hayır | `4` | Izgaradaki sütun sayısı (1-16) |
| padding | integer | Hayır | `0` | Piksel cinsinden hücreler arası dolgu (0-64) |
| background | string | Hayır | `"#ffffff"` | Arka plan hex rengi |
| format | string | Hayır | `"png"` | Çıktı biçimi: `png`, `webp` veya `jpeg` |
| quality | integer | Hayır | `90` | Çıktı kalitesi (1-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notlar {#notes}

- 2 ile 64 arası görüntü kabul eder. Tüm görüntüler, yüklenen ilk görüntünün boyutlarına uyacak şekilde yeniden boyutlandırılır.
- `frames` dizisi, çıktıdaki her karenin tam piksel koordinatlarını sağlar; CSS sprite tanımları veya oyun motoru kare haritaları için uygundur.
- Satır sayısı, görüntü sayısından ve `columns` değerinden otomatik olarak hesaplanır.
- Hücreler arasına boşluk eklemek için `padding` parametresini kullanın. `background` rengi, dolgu alanlarında ve boş kalan sondaki hücrelerde görünür.
- HEIC, RAW, PSD ve SVG girdileri işlenmeden önce otomatik olarak çözülür.
