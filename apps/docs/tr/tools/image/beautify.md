---
description: "Sade ekran görüntülerini gradyan arka planlar, cihaz çerçeveleri, gölgeler ve sosyal medya boyutlarıyla cilalı görsellere dönüştürün."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 03020cf85347
---

# Ekran Görüntüsünü Güzelleştir {#beautify-screenshot}

Ekran görüntülerine gradyan arka planlar, cihaz çerçeveleri, gölgeler, filigranlar ve sosyal medya boyutları ekleyin. Ürün pazarlaması, sosyal medya ve dokümantasyon için cilalı görseller oluşturmak için idealdir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| backgroundType | dize | Hayır | `"linear-gradient"` | Arka plan türü: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | dize | Hayır | `"#667eea"` | Düz arka plan rengi (`backgroundType` `solid` olduğunda kullanılır) |
| gradientStops | dizi | Hayır | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Gradyan renk durakları (en az 2). Her durak bir `color` (onaltılık) ve bir `position` (0-100) değerine sahiptir. |
| gradientAngle | sayı | Hayır | 135 | Derece cinsinden gradyan açısı (0 ile 360 arası) |
| padding | sayı | Hayır | 64 | Görselin çevresindeki piksel cinsinden dolgu (0 ile 256 arası) |
| borderRadius | sayı | Hayır | 12 | Ekran görüntüsünün köşe yarıçapı (0 ile 64 arası) |
| shadowPreset | dize | Hayır | `"subtle"` | Gölge ön ayarı: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | sayı | Hayır | 20 | Özel gölge bulanıklık yarıçapı (0 ile 100 arası, `shadowPreset` `custom` olduğunda kullanılır) |
| shadowOffsetX | sayı | Hayır | 0 | Özel gölge yatay konumu (-50 ile 50 arası) |
| shadowOffsetY | sayı | Hayır | 10 | Özel gölge dikey konumu (-50 ile 50 arası) |
| shadowColor | dize | Hayır | `"#000000"` | Onaltılık olarak özel gölge rengi |
| shadowOpacity | sayı | Hayır | 30 | Özel gölge opaklığı (0 ile 100 arası) |
| frame | dize | Hayır | `"none"` | Cihaz veya pencere çerçevesi: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | dize | Hayır | - | Pencere çerçevesi başlık çubuklarında görüntülenen başlık metni |
| socialPreset | dize | Hayır | `"none"` | Sosyal medya boyutlarına yeniden boyutlandır: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | dize | Hayır | - | İsteğe bağlı filigran metni yerleşimi |
| watermarkPosition | dize | Hayır | `"bottom-right"` | Filigran konumu: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | sayı | Hayır | 50 | Filigran opaklığı (0 ile 100 arası) |
| outputFormat | dize | Hayır | `"png"` | Çıktı biçimi: `png`, `jpeg`, `webp` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Arka Plan Görseliyle {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notlar {#notes}

- İki dosya alanı kabul eder: `file` (zorunlu, ana ekran görüntüsü) ve `backgroundImage` (isteğe bağlı, `backgroundType` `image` olduğunda kullanılır).
- HEIC, RAW, PSD ve SVG giriş biçimlerini destekler (otomatik olarak çözülür).
- Gölge ön ayarları belirli değerlere eşlenir:
  - `subtle`: bulanıklık 20, offsetY 4, opaklık %20
  - `medium`: bulanıklık 40, offsetY 10, opaklık %35
  - `dramatic`: bulanıklık 80, offsetY 20, opaklık %50
- Sosyal medya ön ayarları, `contain` modunu kullanarak nihai çıktıyı hedef boyutlara sığacak şekilde yeniden boyutlandırır:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Cihaz çerçeveleri (`iphone`, `macbook`, `ipad`) görselin çevresine bir donanım çerçevesi uygular ve `borderRadius` ayarını atlar.
- Saydamlık gerektiğinde (gölge, köşe yarıçapı, cihaz çerçeveleri veya saydam arka plan), `jpeg` seçilmiş olsa bile çıktı PNG'ye zorlanır.
- Görsel arka planlar pipeline/toplu modda desteklenmez.
