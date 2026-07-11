---
description: "Formları ve ek açıklamaları sayfa içeriğine gömün."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 02e49662c3db
---

# PDF Düzleştir {#flatten-pdf}

Etkileşimli form alanlarını ve ek açıklamaları sayfa içeriğine gömerek her yerde aynı görünen statik bir PDF üretin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Bir PDF dosyası içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir PDF yükleyin, tüm formlar ve ek açıklamalar düzleştirilecektir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notlar {#notes}

- Kabul edilen girdi biçimi: `.pdf`.
- Bu, sonucu doğrudan döndüren hızlı (eşzamanlı) bir araçtır.
- Form alanı değerleri çıktıda statik metin olarak korunur.
- Ek açıklamalar (yorumlar, vurgular, yapışkan notlar) sayfa içeriğinin bir parçası olur ve artık düzenlenemez.
