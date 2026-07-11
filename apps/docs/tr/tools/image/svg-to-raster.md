---
description: "Toplu destekle SVG dosyalarını özel çözünürlük ve DPI'da PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF veya JXL'ye dönüştürün."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: e2a4a485f4b4
---

# SVG'den Raster'a {#svg-to-raster}

SVG dosyalarını özel çözünürlük ve DPI'da raster görüntü biçimlerine (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF veya JXL) dönüştürün. Ayrıca birden fazla SVG'nin toplu dönüştürülmesini de destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| width | integer | Hayır | - | Piksel cinsinden hedef genişlik (1 ile 65536 arası). Yalnızca bir boyut ayarlanırsa en-boy oranını korur. |
| height | integer | Hayır | - | Piksel cinsinden hedef yükseklik (1 ile 65536 arası). Yalnızca bir boyut ayarlanırsa en-boy oranını korur. |
| dpi | integer | Hayır | 300 | Render DPI'ı, temel rasterleştirme yoğunluğunu denetler (36 ile 2400 arası) |
| quality | number | Hayır | 90 | Kayıplı biçimler için çıktı kalitesi (1 ile 100 arası) |
| backgroundColor | string | Hayır | `"#00000000"` | Hex olarak arka plan rengi (6 veya 8 karakter, 8 karakter alfa içerir) |
| outputFormat | string | Hayır | `"png"` | Çıktı biçimi: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Toplu Uç Nokta {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Tek bir istekte birden fazla SVG dosyasını dönüştürün. Bir ZIP arşivi döndürür.

### Ek Toplu Parametreler {#additional-batch-parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Hayır | - | İlerleme takibi için isteğe bağlı istemci tarafından sağlanan iş kimliği (maks 128 karakter) |

### Toplu Örnek İstek {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Toplu Yanıt {#batch-response}

Toplu uç nokta, bir ZIP dosyasını doğrudan şu başlıklarla aktarır:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notlar {#notes}

- Yalnızca SVG ve SVGZ dosyalarını kabul eder (yalnızca uzantıyı değil içeriği doğrular). SVGZ otomatik olarak açılır.
- SVG içeriği, XSS ve harici kaynak yüklemeyi önlemek için render edilmeden önce temizlenir.
- `dpi` ayarı, SVG'nin rasterleştirildiği yoğunluğu denetler. Daha yüksek DPI, aynı SVG görüntüleme alanından daha büyük piksel boyutları üretir.
- Hem `width` hem `height` sağlandığında, görüntü `fit: inside` kullanılarak yeniden boyutlandırılır (sınırlar içinde en-boy oranını korur).
- Tarayıcıların yerel olarak görüntüleyemediği biçimler (TIFF, HEIF) için yanıta bir `previewUrl` dahil edilir. Önizleme, 1200px WebP küçük resmidir.
- Varsayılan arka plan `#00000000` tamamen saydamdır. Beyaz arka plan için `#FFFFFF` olarak ayarlayın (saydamlığı desteklemeyen JPEG çıktısıyla kullanışlıdır).
- Toplu işleme, `MAX_BATCH_SIZE` sunucu yapılandırmasına uyar ve performans için eşzamanlı işçiler kullanır.
- Toplu işlemlerin ilerlemesi, `/api/v1/jobs/:jobId/progress` üzerinde SSE aracılığıyla takip edilebilir.
