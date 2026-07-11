---
description: "Bir Markdown dosyasını bağımsız bir HTML sayfasına dönüştürün."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: a49177d5fc06
---

# Markdown to HTML {#markdown-to-html}

Bir Markdown dosyasını bağımsız bir HTML sayfasına dönüştürün. Kaynakta başvurulan uzak görüntüler çıktıda olduğu gibi bırakılır.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Bir Markdown dosyası içeren multipart form verisi kabul eder.

## Parameters {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir Markdown dosyası yükleyin ve HTML'e dönüştürülecektir.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- Kabul edilen giriş formatları: `.md`, `.markdown`.
- Bu, sonucu doğrudan döndüren hızlı (senkron) bir araçtır.
- Çıktı, satır içi stillere sahip bağımsız bir HTML sayfasıdır.
- Markdown kaynağındaki uzak görüntü URL'leri olduğu gibi korunur ve getirilmez.
