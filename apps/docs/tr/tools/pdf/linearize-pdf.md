---
description: "Hızlı web görüntüleme (ilerlemeli indirme) için bir PDF'i doğrusallaştırın."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 321552dcf159
---

# PDF'i Web İçin Optimize Et {#web-optimize-pdf}

Bir PDF'i doğrusallaştırın; böylece web tarayıcılarında tam dosyayı beklemeden ilerlemeli olarak indirilip görüntülenebilir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Bir PDF dosyası içeren multipart form verisini kabul eder. `settings` alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın ayar parametreleri yoktur. PDF dosyasını doğrudan yükleyin.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notlar {#notes}

- Doğrusallaştırma, PDF'in iç yapısını yeniden düzenleyerek tam dosya indirilmeden önce ilk sayfanın işlenebilmesini sağlar.
- Eklenen doğrusallaştırma verisi nedeniyle çıktı dosyası girdiden biraz daha büyük olabilir.
- Zaten doğrusallaştırılmış PDF'ler sorunsuz şekilde yeniden doğrusallaştırılır.
