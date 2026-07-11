---
description: "Bir PDF'ten parola korumasını kaldırın."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: d1a0dd0e988d
---

# PDF Kilidini Aç {#unlock-pdf}

Doğru parolayı sağlayarak şifreli bir PDF'ten parola korumasını kaldırın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| password | string | Evet | - | PDF'in şifresini çözmek için parola (1-256 karakter) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notlar {#notes}

- Doğru parola sağlanmalıdır; yanlış bir parola bir 400 hatası döndürür.
- Şifre çözme için kullanıcı parolası veya sahip parolası çalışır.
- Parolalar denetim günlüklerinden gizlenir.
