---
description: "Yapay zeka destekli OCR kullanarak PDF belgelerinden metin çıkarın."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 78544c45de5b
---

# PDF OCR {#pdf-ocr}

Yapay zeka destekli optik karakter tanıma kullanarak PDF belgelerinden metin çıkarın. Birden fazla kalite katmanını ve dili destekler. OCR özellik paketinin kurulu olmasını gerektirir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Bir PDF dosyası ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| quality | string | Hayır | `"balanced"` | OCR kalite katmanı: `fast`, `balanced`, `best` |
| language | string | Hayır | `"auto"` | Belge dili: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Hayır | `"all"` | Sayfa seçimi, örn. `"all"`, `"1-3"`, `"1,3,5"` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Örnek Yanıt {#example-response}

`202 Accepted` döndürür. İlerlemeyi `/api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden izleyin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notlar {#notes}

- Kabul edilen girdi biçimi: `.pdf`.
- Bu, **OCR özellik paketinin** kurulu olmasını gerektiren bir yapay zeka aracıdır. Paket kurulu değilse API `501 Not Implemented` döndürür.
- `fast` kalite katmanı daha hızlı işleme için daha hafif bir model kullanır; `best` ise hız pahasına daha doğru bir model kullanır.
- `auto` dil ayarı belge dilini otomatik olarak algılamaya çalışır.
- Aralıklar (`"1-3"`), virgülle ayrılmış listeler (`"1,3,5"`) veya her sayfa için `"all"` kullanarak belirli sayfaları hedefleyebilirsiniz.
- Zaten seçilebilir metin içeren PDF'ler için bunun yerine daha hızlı [PDF'ten Metne](./pdf-to-text) aracını kullanmayı düşünün.
