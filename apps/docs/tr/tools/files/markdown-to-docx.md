---
description: "Bir Markdown dosyasını bir Word belgesine (DOCX) dönüştürün."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: a3105b82726a
---

# Markdown to Word {#markdown-to-word}

Bir Markdown dosyasını bir Word belgesine (DOCX) dönüştürün; başlıkları, listeleri, kod bloklarını ve diğer biçimlendirmeyi koruyun.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Bir Markdown dosyası içeren multipart form verisi kabul eder.

## Parameters {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir Markdown dosyası yükleyin ve DOCX'e dönüştürülecektir.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Kabul edilen giriş formatları: `.md`, `.markdown`.
- Bu, sonucu doğrudan döndüren hızlı (senkron) bir araçtır.
- Başlıklar, kalın, italik, bağlantılar, kod blokları ve listeler Word stillerine eşlenir.
- Dönüştürme, sunucuda Pandoc tarafından gerçekleştirilir.
