---
description: "Normalleştirilmiş sayfa yerleşimleri kullanarak yüklenen imza görüntülerini bir PDF üzerine damgalayın."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: db85d20e93ae
---

# PDF İmzala {#sign-pdf}

Yüklenen bir veya daha fazla imza PNG görüntüsünü bir PDF'in herhangi bir sayfasına damgalayın. Bu rota, PDF'e, bir veya daha fazla imza görüntüsüne ve yerleşim koordinatlarına ihtiyaç duyduğundan özel bir multipart sözleşmesi kullanır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

multipart form verisini kabul eder. PDF `file` olarak gönderilir; imzalar `sig0`, `sig1` vb. olarak gönderilir; yerleşimler bir `placements` JSON alanında gönderilir.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | İmzalanacak PDF dosyası |
| sig0 | file | Evet | - | İlk imza görüntüsü. Ek görüntüler `sig1`, `sig2` vb. kullanır |
| placements | JSON string | Evet | - | Yerleşim nesnelerinden oluşan dizi: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | Hayır | - | SSE üzerinden ilerleme izleme için isteğe bağlı UUID |
| fileId | string | Hayır | - | İmzalı sonucu yeni bir sürüm olarak kaydetmek için isteğe bağlı dosya kitaplığı kimliği |

## Yerleşim Koordinatları {#placement-coordinates}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| sig | integer | İmza görüntüsü dizini. `0`, `sig0` ile eşlenir |
| page | integer | Sıfır tabanlı PDF sayfa dizini |
| x | number | Sayfa kesri olarak sol konum |
| y | number | Sayfa kesri olarak üst konum |
| w | number | Sayfa kesri olarak imza genişliği |
| h | number | Sayfa kesri olarak imza yüksekliği |

Koordinatlar üst-sol başlangıç noktası kullanır. Değerler sayfa kenarının biraz dışına taşabilir; PDF işleyicisi nihai damgayı sayfaya kırpar.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

İstek eşzamanlı bekleme penceresi içinde tamamlanamazsa, API şunu döndürür:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`/api/v1/jobs/<jobId>/progress` adresine bağlanın ve iş tamamlandığında sonucu indirin.

## Notlar {#notes}

- Kabul edilen PDF girdi biçimi: `.pdf`.
- İmza görüntüleri geçerli görüntü dosyaları olmalıdır, tipik olarak şeffaflık içeren PNG.
- En fazla 100 imza görüntüsü ve 100 yerleşim kabul edilir.
- `sign-pdf` özel bir rotadır ve standart araç `settings` JSON alanını kullanmaz.
