---
description: "Bir PDF'in her sayfasına sayfa numaraları ekleyin."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 2a77297d2ad6
---

# PDF Sayfa Numaraları {#pdf-page-numbers}

Bir PDF'in her sayfasına "Sayfa N / M" sayfa numaraları ekleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| position | string | Hayır | `"bc"` | Sayfa numarası yerleşimi: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Hayır | `10` | Punto cinsinden yazı tipi boyutu (6-24) |

### Konum Değerleri {#position-values}

- `tl` üst-sol, `tc` üst-orta, `tr` üst-sağ
- `bl` alt-sol, `bc` alt-orta, `br` alt-sağ

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notlar {#notes}

- Sayfa numaraları "Sayfa 1 / 10" biçiminde işlenir.
- Numaralar, mevcut başlık veya kapak sayfaları dahil her sayfaya eklenir.
- Varsayılan konum `"bc"` numaraları her sayfanın alt ortasına yerleştirir.
