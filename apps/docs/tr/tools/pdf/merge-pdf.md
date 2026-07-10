---
description: "Birden fazla PDF'i tek bir belgede birleştirin."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: bac65275c28e
---

# PDF'leri Birleştir {#merge-pdfs}

İki veya daha fazla PDF dosyasını, her girdi dosyasının sayfa sırasını koruyarak tek bir belgede birleştirin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

İki veya daha fazla PDF dosyası içeren multipart form verisini kabul eder. `settings` alanı gerekli değildir.

## Parametreler {#parameters}

Bu aracın ayar parametreleri yoktur. Basitçe iki veya daha fazla PDF dosyası yükleyin.

| Kısıt | Değer |
|------------|-------|
| Minimum dosya | 2 |
| Maksimum dosya | 20 |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notlar {#notes}

- Dosyalar yüklendikleri sırayla birleştirilir.
- En az iki PDF dosyası gereklidir; daha azı sağlanırsa istek bir 400 hatasıyla başarısız olur.
- Maksimum girdi dosyası sayısı 20'dir.
- Şifreli PDF'lerin birleştirilmeden önce kilidinin açılması gerekir.
