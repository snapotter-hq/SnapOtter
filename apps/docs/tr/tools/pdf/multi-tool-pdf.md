---
description: "Diğer PDF'lerdeki sayfaları tek bir düzenleyicide veya API aracılığıyla yeniden sıralayın, döndürün, silin ve çekin."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 4a07ce2c4c46
i18n_hash_version: 2
---

# PDF Çoklu Araç {#multi-tool-pdf}

Açık bir sayfa planından PDF oluşturun: sayfaları yeniden sıralayın, çoğaltın, döndürün veya silin ve ek PDF'lerden sayfaları tek istekte çekin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Bir veya daha fazla PDF dosyası ve bir JSON `settings` alanı içeren multipart form verilerini kabul eder.
İstek başına en fazla 20 giriş belgesi ve 1.200 çıktı sayfası desteklenir.

## Parametreler {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | Çıktı sırasına göre çıktı sayfası planı. Her öğe `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` yüklenen dosyaları yükleme sırasına göre (0 tabanlı) indeksler; `page` o belgedeki 1 tabanlı sayfa numarasıdır. |
| pageCounts | array | Yes | Yüklenen her belgenin gerçek sayfa sayısı, aynı sırayla. Belgesinin sayfa sayısını aşan bir plan sayfası 400 ile reddedilir. |

## Örnek İstek {#example-request}

İlk belgenin 3. ve 1. sayfalarını, ardından ikinci belgenin 1. ve 2. sayfalarını alın; ilk çıktı sayfasını saat yönünde 90° döndürün:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notlar {#notes}

- Aynı sayfa, çoğaltmak için `items` içinde birkaç kez görünebilir.
- `items` içinde olmayan sayfalar çıktıdan çıkarılır.
- `rot` kopyalanan sayfada yeni görüntüleme yönünü kaydeder (mevcut dönüşle birleştirilir); sayfa içeriğine dokunulmaz.
- Dönüş her çıktı kopyası için uygulanır, bu nedenle kopyalar farklı dönüşlere sahip olabilir.
- Çıktı yeni ve düz bir belgedir; kaynak yer imleri ve belge düzeyindeki meta veriler korunmaz.
- İşleme, resmi Docker imajında bulunan qpdf ikili dosyasını gerektirir.
