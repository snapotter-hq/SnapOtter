---
description: "İstenen sayfa sırasını belirterek bir PDF'teki sayfaları yeniden düzenleyin."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 5c7ee0d97b5a
---

# PDF Düzenle {#organize-pdf}

İstenen sayfa dizilimini belirterek bir PDF'teki sayfaları yeniden düzenleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| order | string | Evet | - | qpdf söz dizimindeki istenen sayfa sırası, örn. `"3,1,2,5-z"` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notlar {#notes}

- Sayfa aralıkları qpdf söz dizimini kullanır: `3,1,2` ilk üç sayfayı yeniden düzenler ve `5-z` 5. sayfadan son sayfaya kadar olan sayfaları ekler.
- Sayfalar birden fazla kez listelenerek çoğaltılabilir (örn. `"1,1,2,3"` 1. sayfayı çoğaltır).
- Sıra dizesinde listelenmeyen sayfalar çıktıdan çıkarılır.
