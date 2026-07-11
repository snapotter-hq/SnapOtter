---
description: "Hasarlı veya bozuk bir PDF'i onarmayı deneyin."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 3b196b140fa1
---

# PDF Onar {#repair-pdf}

İç yapısını yeniden oluşturarak hasarlı veya bozuk bir PDF'i onarmayı deneyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Bir PDF dosyası içeren multipart form verisini kabul eder. `settings` alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın ayar parametreleri yoktur. Hasarlı PDF dosyasını doğrudan yükleyin.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notlar {#notes}

- Hatalı biçimlendirilmiş dosyaların geçmesine izin vermek için girdide yapısal doğrulama atlanır.
- Onarım en iyi çabaya dayalıdır; ciddi şekilde bozulmuş dosyalar tam olarak kurtarılamayabilir.
- Yeniden oluşturulan çapraz referans tabloları nedeniyle onarılan PDF, boyut olarak orijinalden biraz farklı olabilir.
