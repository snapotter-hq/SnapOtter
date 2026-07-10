---
description: "Bir PDF'in her sayfasına bir metin filigranı ekleyin."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 47b485c5cda9
---

# PDF Filigran {#watermark-pdf}

Bir PDF'in her sayfasına yapılandırılabilir konum, boyut, opaklık ve döndürme ile bir metin filigranı damgalayın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| text | string | Evet | - | Filigran metni (1-200 karakter) |
| position | string | Hayır | `"c"` | Sayfadaki yerleşim: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Hayır | `48` | Punto cinsinden yazı tipi boyutu (6-72) |
| opacity | number | Hayır | `0.3` | Filigran opaklığı (0.05-1) |
| rotation | number | Hayır | `45` | Derece cinsinden döndürme açısı (-180 ile 180) |

### Konum Değerleri {#position-values}

- `tl` üst-sol, `tc` üst-orta, `tr` üst-sağ
- `l` orta-sol, `c` orta, `r` orta-sağ
- `bl` alt-sol, `bc` alt-orta, `br` alt-sağ

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
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

- Filigran, her sayfada bir metin katmanı olarak işlenir.
- Aynı filigran metni, konumu ve stili tüm sayfalara tek tip olarak uygulanır.
- İçeriği örtmeyen ince filigranlar için daha düşük opaklık değerleri (0.1-0.3) kullanın.
