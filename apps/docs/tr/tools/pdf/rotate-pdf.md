---
description: "Bir PDF'teki sayfaları 90, 180 veya 270 derece döndürün."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 13fa73ce90e5
---

# PDF Döndür {#rotate-pdf}

Bir PDF'teki tüm sayfaları veya seçili sayfaları belirtilen bir açıyla döndürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| angle | integer | Hayır | `90` | Döndürme açısı: `90`, `180` veya `270` |
| range | string | Hayır | `"1-z"` | qpdf söz dizimindeki sayfa aralığı, örn. `"1-5,8"` (`"1-z"` = tüm sayfalar) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notlar {#notes}

- Döndürme saat yönündedir.
- Sayfa aralıkları qpdf söz dizimini kullanır: 1 ile 5 arası sayfalar için `1-5`, son sayfa için `z` ve aralıkları birleştirmek için virgüller.
- Varsayılan aralık `"1-z"` tüm sayfaları döndürür.
