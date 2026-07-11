---
description: "Word, Markdown, HTML veya düz metin dosyalarını EPUB'a dönüştürün."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: a87c9b5507b4
---

# EPUB'a Dönüştür {#convert-to-epub}

Word belgelerini, Markdown, HTML veya düz metin dosyalarını EPUB e-kitap biçimine dönüştürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Bir Word/Markdown/HTML/TXT dosyası içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir belge yükleyin, EPUB'a dönüştürülecektir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## Örnek Yanıt {#example-response}

`202 Accepted` döndürür. İlerlemeyi SSE üzerinden `/api/v1/jobs/{jobId}/progress` adresinden takip edin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notlar {#notes}

- Kabul edilen giriş biçimleri: `.docx`, `.md`, `.html`, `.txt`.
- EPUB çıktısı EPUB 3 belirtimini izler.
- Kaynak belgedeki başlıklar içindekiler tablosunu oluşturmak için kullanılır.
- Dönüştürme, sunucuda Pandoc tarafından gerçekleştirilir.
