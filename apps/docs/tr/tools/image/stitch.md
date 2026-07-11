---
description: "Hizalama, boşluk, kenarlık ve yeniden boyutlandırma modu üzerinde denetimle görüntüleri yan yana, üst üste veya bir ızgarada birleştirin."
i18n_source_hash: 39333210505a
i18n_provenance: human
i18n_output_hash: b7f7b4ff7d50
---

# Birleştir / Combine {#stitch-combine}

Birden fazla görüntüyü yan yana, dikey olarak üst üste veya bir ızgara halinde birleştirin. Hizalama, boşluk, kenarlık, köşe yarıçapı ve birden fazla yeniden boyutlandırma modunu destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| direction | string | Hayır | `"horizontal"` | Yerleşim yönü: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | Hayır | 2 | Yön `grid` olduğunda sütun sayısı (2 ile 100 arası) |
| resizeMode | string | Hayır | `"fit"` | Görüntülerin nasıl yeniden boyutlandırılacağı: `fit`, `original`, `stretch`, `crop` |
| alignment | string | Hayır | `"center"` | Çapraz eksen hizalaması: `start`, `center`, `end` |
| gap | number | Hayır | 0 | Piksel cinsinden görüntüler arası boşluk (0 ile 1000 arası) |
| border | number | Hayır | 0 | Piksel cinsinden dış kenarlık genişliği (0 ile 500 arası) |
| cornerRadius | number | Hayır | 0 | Nihai çıktıya uygulanan köşe yarıçapı (0 ile 500 arası) |
| backgroundColor | string | Hayır | `"#FFFFFF"` | Hex olarak arka plan/kenarlık rengi (örn. `#FF0000`) |
| format | string | Hayır | `"png"` | Çıktı biçimi: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Hayır | 90 | Çıktı kalitesi (1 ile 100 arası) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notlar {#notes}

- En az 2 görüntü gerektirir. Multipart isteğinde birden fazla görüntü dosyası yükleyin.
- HEIC, RAW, PSD ve SVG giriş biçimlerini destekler (otomatik olarak çözülür).
- Yeniden boyutlandırma modları:
  - `fit` - Görüntüleri birleştirme ekseni boyunca en küçük boyuta uyacak şekilde ölçekler.
  - `original` - Orijinal boyutları korur (düzensiz kenarlar oluşturabilir).
  - `stretch` - En-boy oranını korumadan görüntüleri en küçük boyuta uymaya zorlar.
  - `crop` - En küçük boyuta uyacak şekilde görüntüleri kaplama-kırpma yapar.
- `grid` modunda hücreler, tüm görüntülerin medyan boyutlarına göre boyutlandırılır.
- `cornerRadius`, tek tek görüntülere değil, tüm nihai çıktıya uygulanır.
- Bellek tükenmesini önlemek için tuval boyutu `MAX_CANVAS_PIXELS` sunucu yapılandırmasıyla sınırlandırılır.
