---
description: "Görüntü motoru işlemleri referansı. Tüm Sharp tabanlı görüntü işleme işlemleri ve parametreleri."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 586964e968e9
---

# Görüntü motoru {#image-engine}

`@snapotter/image-engine` paketi, AI olmayan tüm görüntü işlemlerini yönetir. [Sharp](https://sharp.pixelplumbing.com/) kitaplığını sarmalar ve harici bağımlılık olmadan tamamen işlem içinde çalışır.

## İşlemler {#operations}

### resize {#resize}

Bir görüntüyü belirli boyutlara veya yüzdeye göre ölçekler.

| Parametre | Tür | Açıklama |
|---|---|---|
| `width` | number | Piksel cinsinden hedef genişlik |
| `height` | number | Piksel cinsinden hedef yükseklik |
| `fit` | string | `cover`, `contain`, `fill`, `inside` veya `outside` |
| `withoutEnlargement` | boolean | Doğruysa, daha küçük görüntüleri büyütmez |
| `percentage` | number | Mutlak boyutlar yerine yüzdeye göre ölçekle |

`width`, `height` değerlerini veya ikisini birden ayarlayabilirsiniz. Yalnızca birini ayarlarsanız, en boy oranını korumak için diğeri hesaplanır.

### crop {#crop}

Görüntüden dikdörtgen bir bölge keser.

| Parametre | Tür | Açıklama |
|---|---|---|
| `left` | number | Sol kenardan X ofseti |
| `top` | number | Üst kenardan Y ofseti |
| `width` | number | Kırpma alanının genişliği |
| `height` | number | Kırpma alanının yüksekliği |
| `unit` | string | `px` (varsayılan) veya `percent` |

### rotate {#rotate}

Görüntüyü belirli bir açıyla döndürür.

| Parametre | Tür | Açıklama |
|---|---|---|
| `angle` | number | Derece cinsinden döndürme açısı (0-360) |
| `background` | string | Açığa çıkan alan için dolgu rengi (varsayılan: `#000000`). Yalnızca 90 derece olmayan açılara uygulanır. |

### flip {#flip}

Görüntüyü yatay, dikey veya her ikisinde aynalar. En az biri doğru olmalıdır.

| Parametre | Tür | Açıklama |
|---|---|---|
| `horizontal` | boolean | Soldan sağa aynala |
| `vertical` | boolean | Yukarıdan aşağıya aynala |

### convert {#convert}

Görüntü biçimini değiştirir.

| Parametre | Tür | Açıklama |
|---|---|---|
| `format` | string | Hedef biçim: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Sıkıştırma kalitesi (1-100, kayıplı biçimlere uygulanır) |

İlk yedi biçim (`jpg` ile `jxl` arası) Sharp tarafından işlem içinde kodlanır. Kalan biçimler API katmanında harici kodlayıcılar kullanır: `heic`/`heif` heif-enc aracılığıyla, `bmp`/`ico` ImageMagick aracılığıyla, `jp2` opj_compress aracılığıyla ve `qoi` satır içi bir TypeScript codec aracılığıyla.

### compress {#compress}

Aynı biçimi koruyarak dosya boyutunu azaltır.

| Parametre | Tür | Açıklama |
|---|---|---|
| `quality` | number | Hedef kalite (1-100) |
| `targetSizeBytes` | number | Bayt cinsinden isteğe bağlı hedef dosya boyutu |
| `format` | string | İsteğe bağlı biçim geçersiz kılma |

### strip-metadata {#strip-metadata}

Görüntüden EXIF, IPTC, XMP ve ICC meta verilerini kaldırır. Parametre olmadan (veya `stripAll: true` ile) her şeyi kaldırır. Seçici kaldırma için ayrı bayraklar geçirin.

| Parametre | Tür | Açıklama |
|---|---|---|
| `stripAll` | boolean | Tüm meta verileri kaldır (bayrak ayarlanmadığında varsayılan) |
| `stripExif` | boolean | EXIF verilerini kaldır (`stripGps` ayrıca ayarlanmamışsa GPS dahil) |
| `stripGps` | boolean | GPS konum verilerini kaldır |
| `stripIcc` | boolean | ICC renk profilini kaldır |
| `stripXmp` | boolean | XMP meta verilerini kaldır |

### Renk ayarlamaları {#color-adjustments}

Bu işlemler bir görüntünün renk özelliklerini değiştirir. Her biri tek bir sayısal değer alır.

| İşlem | Parametre | Aralık | Açıklama |
|---|---|---|---|
| `brightness` | `value` | -100 ile 100 | Parlaklığı ayarla |
| `contrast` | `value` | -100 ile 100 | Kontrastı ayarla |
| `saturation` | `value` | -100 ile 100 | Renk doygunluğunu ayarla |

### Renk filtreleri {#color-filters}

Bunlar sabit bir renk dönüşümü uygular. Parametre almazlar.

| İşlem | Açıklama |
|---|---|
| `grayscale` | Gri tonlamaya dönüştür |
| `sepia` | Sepya ton uygula |
| `invert` | Tüm renkleri tersine çevir |

### Renk kanalları {#color-channels}

Bireysel RGB renk kanallarını ayarlar. Değerler, 100 = değişiklik yok olan çarpanlardır.

| Parametre | Tür | Açıklama |
|---|---|---|
| `red` | number | Kırmızı kanal çarpanı (0 ile 200, 100 = değişmemiş) |
| `green` | number | Yeşil kanal çarpanı (0 ile 200, 100 = değişmemiş) |
| `blue` | number | Mavi kanal çarpanı (0 ile 200, 100 = değişmemiş) |

### sharpen {#sharpen}

Tek bir değerle kontrol edilen basit keskinleştirme.

| Parametre | Tür | Açıklama |
|---|---|---|
| `value` | number | Keskinleştirme yoğunluğu (0 ile 100). 0,5-10 arası bir Gauss sigma değerine eşlenir. |

### sharpen-advanced {#sharpen-advanced}

Üç seçilebilir yöntem ve isteğe bağlı bir gürültü azaltma ön geçişi ile gelişmiş keskinleştirme.

| Parametre | Tür | Açıklama |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` veya `high-pass` |
| `sigma` | number | Gauss bulanıklık yarıçapı, 0,5-10 (uyarlamalı) |
| `m1` | number | Düz alan keskinleştirme, 0-10 (uyarlamalı) |
| `m2` | number | Dokulu alan keskinleştirme, 0-20 (uyarlamalı) |
| `x1` | number | Düz/tırtıklı eşiği, 0-10 (uyarlamalı) |
| `y2` | number | Maksimum aydınlatma (halo kelepçesi), 0-50 (uyarlamalı) |
| `y3` | number | Maksimum karartma (halo kelepçesi), 0-50 (uyarlamalı) |
| `amount` | number | Yoğunluk yüzdesi, 0-500 (unsharp-mask) |
| `radius` | number | Bulanıklık yarıçapı, 0,1-5,0 (unsharp-mask) |
| `threshold` | number | Minimum kenar parlaklığı, 0-255 (unsharp-mask) |
| `strength` | number | Karıştırma gücü, 0-100 (high-pass) |
| `kernelSize` | number | 3x3 / 5x5 çekirdek için `3` veya `5` (high-pass) |
| `denoise` | string | Gürültü azaltma ön geçişi: `off`, `light`, `medium` veya `strong` |

Parametreler yönteme özgüdür. Yalnızca seçilen yöntemle ilgili olanları sağlayın.

### color-blindness {#color-blindness}

3x3 renk yeniden birleştirme matrisi kullanarak bir renk görme eksikliğini simüle eder.

| Parametre | Tür | Açıklama |
|---|---|---|
| `type` | string | Şunlardan biri: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Tüm bloğu kaldırmadan bireysel EXIF/IPTC meta veri alanlarını yazar veya kaldırır.

| Parametre | Tür | Açıklama |
|---|---|---|
| `artist` | string | EXIF Artist etiketi |
| `copyright` | string | EXIF Copyright etiketi |
| `imageDescription` | string | EXIF ImageDescription etiketi |
| `software` | string | EXIF Software etiketi |
| `dateTime` | string | EXIF DateTime etiketi |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal etiketi |
| `clearGps` | boolean | Tüm GPS etiketlerini kaldır |
| `fieldsToRemove` | string[] | Silinecek EXIF alan adlarının listesi |

Tüm parametreler isteğe bağlıdır. `fieldsToRemove` içinde listelenen alanlar mevcut EXIF bloğundan silinir. Adlandırılmış parametreler aracılığıyla ayarlanan alanlar yazılır (veya üzerine yazılır). MakerNote gibi ikili/güvenli olmayan anahtarlar sessizce yok sayılır.

## Biçim algılama {#format-detection}

Motor, giriş biçimlerini yalnızca dosya uzantılarından değil, dosya başlıklarından otomatik olarak algılar. Bu, aslında bir PNG olan bir `.jpg` dosyasının doğru şekilde işleneceği anlamına gelir. Algılama çok katmanlı bir yaklaşım kullanır: önce sihirli baytlar, ardından yedek olarak dosya uzantısı.

SnapOtter, 20+ markadan 23 kamera RAW biçimi, profesyonel biçimler (PSD, EPS, OpenEXR, HDR), modern codec'ler (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) ve bilimsel/oyun biçimleri (FITS, DDS) dahil olmak üzere **55+ giriş biçimi** ve **13 çıkış biçimi** destekler. Kod çözme, mümkün olduğunda Sharp tarafından yerel olarak, ImageMagick, LibRaw ve özel CLI kod çözücülerine otomatik yedeklemeyle yönetilir.

Tam liste için [Desteklenen Biçimler](/tr/guide/supported-formats) sayfasına bakın.

## Meta veri çıkarma {#metadata-extraction}

`info` aracı görüntü meta verilerini döndürür. Tam alan referansı için [Görüntü Bilgisi](/tr/tools/image/info) sayfasına bakın.

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
