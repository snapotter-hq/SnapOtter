---
description: "Bir EPUB'ı PDF, DOCX, HTML veya Markdown'a dönüştürün."
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: f1e1c836f0ac
---

# EPUB'dan Dönüştür {#convert-epub}

Bir EPUB e-kitabını PDF, Word (DOCX), HTML veya Markdown'a dönüştürün. Kitabın içindeki uzak kaynaklar getirilmez.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Bir EPUB dosyası ve JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Çıktı formatı: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Example Response {#example-response}

`202 Accepted` döndürür. İlerlemeyi `/api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden izleyin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Kabul edilen giriş formatı: `.epub`.
- EPUB'a gömülü uzak kaynaklar (harici görüntüler, yazı tipleri) güvenlik nedeniyle getirilmez.
- Dönüştürülen çıktıdaki görüntü kalitesi EPUB yapısına bağlı olarak değişebilir.
- Dönüştürme, sunucuda Pandoc tarafından gerçekleştirilir.
