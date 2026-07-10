---
description: "Bir Markdown dosyasını stilli bir PDF'e dönüştürün."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 394a59aedc1d
---

# Markdown'dan PDF'e {#markdown-to-pdf}

Bir Markdown dosyasını stilli bir PDF belgesine dönüştürün. Gizlilik için uzak kaynaklar devre dışı bırakılmıştır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Bir Markdown dosyası içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir Markdown dosyası yükleyin, PDF'e dönüştürülecektir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Örnek Yanıt {#example-response}

`202 Accepted` döndürür. İlerlemeyi SSE üzerinden `/api/v1/jobs/{jobId}/progress` adresinden takip edin.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notlar {#notes}

- Kabul edilen giriş biçimleri: `.md`, `.markdown`.
- Uzak kaynaklar (URL'ler aracılığıyla başvurulan görseller, stil sayfaları) gizlilik ve güvenlik için getirilmez.
- Markdown önce HTML'e işlenir, ardından WeasyPrint aracılığıyla PDF'e dönüştürülür.
- Kod blokları, tablolar ve diğer Markdown ögeleri PDF çıktısında stillendirilir.
