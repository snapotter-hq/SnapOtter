---
description: "AVIF, JXL ve HEIC gibi modern biçimler dahil olmak üzere görüntüleri biçimler arasında dönüştürün."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: 2ff55524f83b
---

# Görüntü Dönüştür {#convert}

Görüntüleri biçimler arasında dönüştürün. HEIC, JXL, BMP, ICO, JP2, QOI ve PSD gibi özel biçimlerin yanı sıra yaygın web biçimlerini de destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/convert`

Bir görüntü dosyası ve bir JSON `settings` alanı ile çok parçalı form verilerini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| format | string | Evet | - | Hedef biçim: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Hayır | - | Çıktı kalitesi (1-100). jpg, webp, avif, heic gibi kayıplı biçimlere uygulanır. |

## Desteklenen Çıktı Biçimleri {#supported-output-formats}

| Biçim | Tür | Notlar |
|--------|------|-------|
| jpg | Kayıplı | JPEG, en iyi uyumluluk |
| png | Kayıpsız | Saydamlığı destekler |
| webp | Her ikisi | Modern web biçimi, iyi sıkıştırma |
| avif | Kayıplı | Yeni nesil biçim, mükemmel sıkıştırma |
| tiff | Her ikisi | Baskı/yayın iş akışları |
| gif | Kayıpsız | 256 renkle sınırlı |
| heic / heif | Kayıplı | Apple ekosistemi biçimi |
| jxl | Her ikisi | JPEG XL, yeni nesil biçim |
| bmp | Kayıpsız | Sıkıştırılmamış bit eşlem |
| ico | Kayıpsız | Windows simge biçimi |
| jp2 | Kayıplı | JPEG 2000 |
| qoi | Kayıpsız | Quite OK Image biçimi |
| psd | Katmanlı | Adobe Photoshop (ImageMagick gerektirir) |
| ppm | Kayıpsız | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vektör | Encapsulated PostScript |
| tga | Kayıpsız | Targa görüntü biçimi |

## Örnek İstek {#example-request}

WebP'ye dönüştür:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

PNG'ye dönüştür (kayıpsız):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notlar {#notes}

- Çıktı dosya adı uzantısı, hedef biçimle eşleşecek şekilde otomatik olarak güncellenir.
- SVG girişleri, dönüştürmeden önce 300 DPI'de rasterleştirilir.
- PSD dönüştürme, sunucuda ImageMagick'in kurulu olmasını gerektirir.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI ve TGA, özel CLI kodlayıcıları kullanır ve Sharp işlemesini atlar.
- HEIC/HEIF kodlaması, sistem HEIC kodlayıcı kitaplığını kullanır.
- Giriş biçimleri geniştir: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, vb.), PSD, SVG, BMP ve daha fazlası.
