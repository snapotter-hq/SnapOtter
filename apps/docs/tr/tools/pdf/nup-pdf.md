---
description: "Yaprak başına birden fazla PDF sayfasını düzenleyin (2'li, 4'lü vb.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: 5fd7f68b9845
---

# Yaprak Başına Sayfa (N-up) {#n-up-pdf}

Yazdırırken kâğıttan tasarruf etmek için yaprak başına birden fazla sayfayı, örneğin 2'li veya 4'lü düzenlerde yerleştirin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Hayır | `2` | Yaprak başına sayfa: `2`, `3`, `4`, `8`, `9`, `12` veya `16` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notlar {#notes}

- Sayfalar okuma sırasına göre düzenlenir (soldan sağa, yukarıdan aşağıya).
- Çıktı sayfa boyutu orijinalle eşleşir; her bir sayfa ızgaraya sığacak şekilde küçültülür.
- `perSheet: 4` ile 20 sayfalık bir belge 5 sayfalık bir çıktı üretir.
