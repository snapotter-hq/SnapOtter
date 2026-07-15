---
description: "Bir görüntüyü satır ve sütuna göre veya piksel boyutuna göre ızgara döşemelerine bölün, ZIP arşivi olarak döndürülür."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 01424920320f
---

# Görüntü Böl {#image-splitting}

Tek bir görüntüyü sütun/satır sayısına göre veya belirli piksel boyutlarına göre ızgara döşemelerine bölün. Tüm döşemeleri içeren bir ZIP arşivi döndürür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| columns | integer | Hayır | 3 | Bölünecek sütun sayısı (1 ile 100 arası) |
| rows | integer | Hayır | 3 | Bölünecek satır sayısı (1 ile 100 arası) |
| tileWidth | integer | Hayır | - | Piksel cinsinden döşeme genişliği (min 10). Hem `tileWidth` hem `tileHeight` ayarlandığında `columns` değerini geçersiz kılar. |
| tileHeight | integer | Hayır | - | Piksel cinsinden döşeme yüksekliği (min 10). Hem `tileWidth` hem `tileHeight` ayarlandığında `rows` değerini geçersiz kılar. |
| outputFormat | string | Hayır | `"original"` | Döşemeler için çıktı biçimi: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Hayır | 90 | Kayıplı biçimler için çıktı kalitesi (1 ile 100 arası) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Örnek Yanıt {#example-response}

Yanıt, `Content-Type: application/zip` ile doğrudan bir ZIP dosyası olarak aktarılır. Dosya adı `split-<jobId>.zip` desenini izler.

ZIP içindeki her döşeme `<originalBaseName>_r<row>_c<col>.<ext>` olarak adlandırılır (örn. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Notlar {#notes}

- Tek bir görüntü dosyası kabul eder.
- HEIC, RAW, PSD ve SVG giriş biçimlerini destekler (otomatik olarak çözülür).
- Hem `tileWidth` hem `tileHeight` sağlandığında, bunlar `columns`/`rows` üzerinde önceliğe sahiptir. Izgara boyutları `ceil(imageWidth / tileWidth)` ve `ceil(imageHeight / tileHeight)` olarak hesaplanır.
- Kenar döşemeleri (en sağdaki sütun, alt satır), görüntü boyutları eşit olarak bölünemiyorsa belirtilen döşeme boyutundan daha küçük olabilir.
- Maksimum ızgara boyutu 100x100 (10.000 döşeme) ile sınırlandırılmıştır.
- Yanıt ZIP'i doğrudan aktarır, bu nedenle JSON yanıt gövdesi yoktur. Dosyayı kaydetmek için curl ile `--output` kullanın.
