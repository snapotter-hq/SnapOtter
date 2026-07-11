---
description: "Bir PDF'ten düz metin çıkarın."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 17f1d460723d
---

# PDF'ten Metne {#pdf-to-text}

Bir PDF belgesindeki tüm okunabilir düz metni bir metin dosyasına çıkarın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Bir PDF dosyası içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir PDF yükleyin, metin içeriği çıkarılacaktır.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notlar {#notes}

- Kabul edilen girdi biçimi: `.pdf`.
- Bu, sonucu doğrudan döndüren hızlı (eşzamanlı) bir araçtır.
- Yanıttaki `chars` alanı çıkarılan karakter sayısını gösterir.
- Yalnızca dijital olarak gömülü metin çıkarılır. Taranmış belgeler veya görüntü tabanlı PDF'ler için bunun yerine [PDF OCR](./ocr-pdf) aracını kullanın.
