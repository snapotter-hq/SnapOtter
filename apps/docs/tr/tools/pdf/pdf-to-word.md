---
description: "Bir PDF'i Word belgesine (DOCX) dönüştürün."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 0ded9d821381
---

# PDF'ten Word'e {#pdf-to-word}

Metin tabanlı bir PDF'i Word belgesine (DOCX) dönüştürün. Seçilebilir metin içeren PDF'ler için en uygunudur; taranmış sayfalar önce OCR gerektirir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Bir PDF dosyası içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir PDF yükleyin, DOCX'e dönüştürülecektir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
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
- Metin tabanlı PDF'lerle en iyi şekilde çalışır. Taranmış veya yalnızca görüntü içeren sayfalar boş veya asgari çıktı üretir; önce bir metin katmanı eklemek için [PDF OCR](./ocr-pdf) kullanın.
- Dönüştürme, sunucuda başsız çalışan LibreOffice tarafından gerçekleştirilir.
- Karmaşık düzenler (çok sütunlu, üst üste binen öğeler) mükemmel şekilde dönüştürülemeyebilir.
