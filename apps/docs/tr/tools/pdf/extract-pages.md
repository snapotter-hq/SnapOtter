---
description: "Seçili sayfaları bir PDF'ten yeni bir belgeye çekin."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: feb1f6d036f7
---

# Sayfaları Çıkar {#extract-pages}

Seçili sayfaları bir PDF'ten yeni, daha küçük bir belgeye çekin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| range | string | Evet | - | qpdf söz dizimindeki sayfa aralığı, örn. `"1-5,8,10-z"` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notlar {#notes}

- Sayfa aralıkları qpdf söz dizimini kullanır: 1 ile 5 arası sayfalar için `1-5`, son sayfa için `z` ve aralıkları birleştirmek için virgüller (örn. `1-3,7,10-z`).
- Çıkarılan sayfalar orijinal biçimlendirmelerini, ek açıklamalarını ve bağlantılarını korur.
