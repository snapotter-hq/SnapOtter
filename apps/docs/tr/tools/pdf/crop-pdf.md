---
description: "Bir PDF'in tüm sayfalarını tek tip bir kenar boşluğuyla kırpın."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: d07934e7acca
---

# PDF Kırp {#crop-pdf}

Tek tip bir kenar boşluğu uygulayarak bir PDF'in tüm sayfalarını kırpın ve her kenardan içeriği eşit şekilde kesin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| margin | number | Hayır | `20` | Punto cinsinden tek tip kırpma kenar boşluğu (0-2000) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notlar {#notes}

- Kenar boşluğu değeri PDF puntosu cinsindendir (1 punto = 1/72 inç).
- Aynı kenar boşluğu her sayfanın dört kenarına da uygulanır.
- `0` değerinde bir kenar boşluğu mevcut tüm kırpma kenar boşluklarını kaldırır ve tam medya kutusunu gösterir.
