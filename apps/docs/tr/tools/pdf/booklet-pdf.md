---
description: "Bir kitapçık halinde katlamak için PDF sayfalarını düzenleyin."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 68b32320e9d2
---

# Kitapçık PDF {#booklet-pdf}

Basılan yaprakların bir kitapçık halinde katlanabilmesi için sayfaları çift taraflı yazdırma için düzenleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Hayır | `2` | Yaprak başına sayfa: `2`, `4`, `6` veya `8` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notlar {#notes}

- Varsayılan `perSheet: 2`, her yaprağa iki sayfayı yan yana yerleştirir; bu, çift taraflı yazdırma için standart kitapçık düzenidir.
- Toplam sayfa sayısı yaprak boyutunun katı değilse boş sayfalar otomatik olarak eklenir.
- Çıktıyı kısa kenar ciltlemede çift taraflı yazdırın, ardından katlayın ve zımbalayın.
