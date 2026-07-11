---
description: "Bir PDF'e AES-256 şifrelemesiyle parola koruması ekleyin."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 6babe817dc1f
---

# PDF Koru {#protect-pdf}

AES-256 şifrelemesi kullanarak bir PDF'e parola koruması ekleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| userPassword | string | Evet | - | PDF'i açmak için gereken parola (1-256 karakter) |
| ownerPassword | string | Hayır | `userPassword` ile aynı | İzinler için sahip parolası (1-256 karakter) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notlar {#notes}

- Şifreleme AES-256 kullanır.
- `ownerPassword` atlanırsa, varsayılan olarak `userPassword` ile aynı değere ayarlanır.
- Parolalar denetim günlüklerinden gizlenir.
- Şifreli PDF, açmak için kullanıcı parolasını ve tam izinler için (farklıysa) sahip parolasını gerektirir.
