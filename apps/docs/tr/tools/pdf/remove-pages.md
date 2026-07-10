---
description: "Bir PDF'ten belirli sayfaları silin."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 7e5c0d3d554b
---

# Sayfaları Kaldır {#remove-pages}

Kalan tüm sayfaları olduğu gibi tutarak bir PDF'ten belirli sayfaları silin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| pages | string | Evet | - | qpdf söz diziminde kaldırılacak sayfa aralığı, örn. `"3,5-7"` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notlar {#notes}

- Bir belgedeki her sayfayı kaldıramazsınız; en az bir sayfa kalmalıdır.
- Sayfa aralıkları qpdf söz dizimini kullanır: tek bir sayfa için `3`, bir aralık için `5-7` ve birleştirmek için virgüller (örn. `1,3,5-7`).
