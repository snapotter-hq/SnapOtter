---
description: "Görselleri QR kodları, barkodlar ve 2D kodlar için tarayın ve açıklamalı çıktı alın."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 711284980e48
---

# Barkod Okuyucu {#barcode-reader}

Yüklenen görselleri her türden barkod ve QR kodu için tarayın. Algılanan her kod için çözülmüş metni, barkod türünü ve konum verilerini döndürür. Ayrıca algılanan kodların çevresinde renkli sınırlayıcı kutular bulunan açıklamalı bir görsel oluşturur.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Bir görsel dosyası ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisi kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| tryHarder | boole | Hayır | `true` | Okunması zor barkodlar için agresif tarama modunu etkinleştirir (daha yavaş ama daha kapsamlı) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Örnek Yanıt {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Yanıt Alanları {#response-fields}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| filename | dize | Özgün dosya adı |
| barcodes | dizi | Algılanan barkod nesnelerinin dizisi |
| annotatedUrl | dize veya null | Açıklamalı görseli indirme URL'si (barkod bulunmazsa null) |
| previewUrl | dize veya null | annotatedUrl ile aynı (ön uç önizleme uyumluluğu için) |

### Barkod Nesnesi {#barcode-object}

| Alan | Tür | Açıklama |
|-------|------|-------------|
| type | dize | Barkod biçimi (QRCode, EAN-13, Code128, DataMatrix, PDF417 vb.) |
| text | dize | Barkodun çözülmüş içeriği |
| position | nesne | topLeft, topRight, bottomLeft, bottomRight koordinatlı sınırlayıcı kutu |

## Desteklenen Barkod Türleri {#supported-barcode-types}

1D barkodlar: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D barkodlar: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Notlar {#notes}

- Barkod algılama için zxing-wasm kitaplığını kullanır.
- Açıklamalı görsel, algılanan her barkodun üzerine renkli çokgen sınırlayıcı kutular ve numaralandırılmış etiketler yerleştirir.
- Tek bir görselde en fazla 255 barkod algılanabilir.
- Barkod bulunmazsa, `barcodes` boş bir dizidir ve `annotatedUrl` null'dur.
- `tryHarder` modu, işlem süresi pahasına daha kapsamlı tarama yapar. Temiz, düzgün hizalanmış barkodların daha hızlı işlenmesi için devre dışı bırakın.
- Açıklamalı çıktı her zaman PNG biçimindedir.
- HEIC, RAW, PSD ve SVG girişleri taranmadan önce otomatik olarak çözülür.
- İşlemeden önce EXIF yönlendirmesi otomatik olarak uygulanır.
