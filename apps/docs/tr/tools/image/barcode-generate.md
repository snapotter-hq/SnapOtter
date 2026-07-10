---
description: "Code 128, EAN-13, UPC-A, Code 39, ITF-14 ve Data Matrix biçimlerinde barkod oluşturun."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 40bd623b2d96
---

# Barkod Oluşturucu {#barcode-generator}

Metin girişinden barkod görselleri oluşturun. Code 128, EAN-13, UPC-A, Code 39, ITF-14 ve Data Matrix biçimlerini destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Bir `application/json` gövdesi kabul eder (multipart değil). Barkod, yüklenen bir dosyadan değil, sağlanan metinden oluşturulur.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| text | dize | Evet | - | Barkodda kodlanacak metin (1-256 karakter) |
| type | dize | Hayır | `"code128"` | Barkod biçimi: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | tam sayı | Hayır | `3` | Görsel ölçek faktörü (1-8) |
| includeText | boole | Hayır | `true` | Metnin barkodun altında görüntülenip görüntülenmeyeceği |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notlar {#notes}

- Çoğu aracın aksine bu uç nokta, barkodlar yüklenen bir dosya yerine metinden oluşturulduğundan multipart form verisi değil, bir JSON gövdesi kabul eder.
- EAN-13 tam olarak 12 veya 13 haneli olmalıdır. UPC-A tam olarak 11 veya 12 haneli olmalıdır. Bir kontrol hanesi atlanırsa otomatik olarak hesaplanır.
- Code 128 en esnek biçimdir ve tüm ASCII karakter kümesini destekler.
- Data Matrix, daha uzun dizeleri kompakt bir kareye kodlamaya uygun 2 boyutlu bir barkod üretir.
