---
description: "Sayfaları çıkarın veya bir PDF'i parçalara ayırın."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 4d890b9635e7
---

# PDF Ayır {#split-pdf}

Bir sayfa aralığını yeni bir PDF'e çıkarın veya bir belgeyi N sayfalık parçalara ayırın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| mode | string | Hayır | `"range"` | Ayırma modu: `range` veya `every` |
| range | string | mode `range` olduğunda | - | qpdf söz dizimindeki sayfa aralığı, örn. `"1-5,8,10-z"` |
| everyN | integer | mode `every` olduğunda | - | N sayfalık parçalara ayır (1-500) |

## Örnek İstek {#example-request}

Belirli sayfaları çıkarın:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

10 sayfalık parçalara ayırın:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notlar {#notes}

- `range` modunda, seçili sayfaları içeren tek bir PDF döndürülür.
- `every` modunda, sonuç ayrı parçaları içeren bir ZIP arşividir.
- Sayfa aralıkları qpdf söz dizimini kullanır: 1 ile 5 arası sayfalar için `1-5`, son sayfa için `z` ve aralıkları birleştirmek için virgüller (örn. `1-3,7,10-z`).
