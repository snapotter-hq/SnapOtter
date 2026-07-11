---
description: "Word belgelerini PDF'e dönüştürün."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 4d47325ec60e
---

# Word'den PDF'e {#word-to-pdf}

Word belgelerini, OpenDocument metnini, RTF veya düz metin dosyalarını PDF'e dönüştürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Bir Word/ODT/RTF/TXT dosyası içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir belge yükleyin, PDF'e dönüştürülecektir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Kabul edilen giriş biçimleri: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Dönüştürme, sunucuda başsız (headless) çalışan LibreOffice tarafından gerçekleştirilir.
- Belgeye gömülü yazı tipleri varsa kullanılır; aksi halde sistem yazı tipleri yerine geçirilir.
- Üst bilgiler, alt bilgiler, tablolar ve görseller PDF çıktısında korunur.
