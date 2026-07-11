---
description: "Bir HTML dosyasını PDF'e dönüştürün."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 90a8bf132ea7
---

# HTML to PDF {#html-to-pdf}

Bir HTML dosyasını biçimlendirilmiş bir PDF belgesine dönüştürün. Uzak kaynaklar (harici görüntüler, stil sayfaları, betikler) gizlilik için devre dışı bırakılmıştır.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Bir HTML dosyası içeren multipart form verisi kabul eder.

## Parameters {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir HTML dosyası yükleyin ve PDF'e dönüştürülecektir.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
```

## Example Response {#example-response}

`202 Accepted` döndürür. İlerlemeyi `/api/v1/jobs/{jobId}/progress` adresinde SSE üzerinden izleyin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Kabul edilen giriş formatları: `.html`, `.htm`.
- Uzak kaynaklar (URL'ler aracılığıyla başvurulan görüntüler, stil sayfaları, betikler) gizlilik ve güvenlik için getirilmez.
- Satır içi stiller ve gömülü görüntüler (data URI'leri) korunur.
- Dönüştürme, sunucuda WeasyPrint tarafından gerçekleştirilir.
