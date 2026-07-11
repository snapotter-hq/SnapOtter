---
description: "Şablonlar veya özel görsellerle, biçimlendirilmiş metin kutuları ve font seçenekleriyle meme oluşturun."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: ae76e07f76ea
---

# Meme Oluşturucu {#meme-generator}

Yerleşik şablonları veya özel görselleri kullanarak meme oluşturun. Klasik meme biçimlendirmesiyle (kalın, dış çizgili metin), birden fazla yerleşim ön ayarı ve font seçenekleriyle metin ekleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Şu ikisinden birini kabul eder:
- Bir görsel dosyası ve bir JSON `settings` alanı içeren **çok parçalı form verisi** (özel görsel modu)
- Bir `templateId` içeren **JSON gövdesi** (şablon modu, dosya yüklemeye gerek yoktur)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| templateId | string | Hayır | - | Yerleşik meme şablonu kimliği. Sağlanırsa görsel yüklemesine gerek yoktur |
| textLayout | string | Hayır | `"top-bottom"` | Metin kutusu yerleşimi: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Hayır | `[]` | `id` ve `text` alanlarını içeren metin kutusu nesnelerinin dizisi |
| fontFamily | string | Hayır | `"anton"` | Font: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Hayır | auto | Piksel cinsinden font boyutu (8 ile 200 arası). Belirtilmezse otomatik hesaplanır |
| textColor | string | Hayır | `"#ffffff"` | Metin dolgu rengi |
| strokeColor | string | Hayır | `"#000000"` | Metin dış çizgi/kontur rengi |
| textAlign | string | Hayır | `"center"` | Metin hizalaması: `left`, `center`, `right` |
| allCaps | boolean | Hayır | `true` | Metni büyük harfe dönüştür |

### Metin Kutuları {#text-boxes}

`textBoxes` dizisindeki her giriş şunları içermelidir:

| Alan | Tür | Açıklama |
|-------|------|-------------|
| id | string | Yerleşimle eşleşen kutu tanımlayıcısı (örn. `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Görüntülenecek meme metni |

### Metin Yerleşimi Kutu Kimlikleri {#text-layout-box-ids}

| Yerleşim | Kullanılabilir Kutu Kimlikleri |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Örnek İstek {#example-request}

Üst ve alt metinli özel görsel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Yerleşik bir şablon kullanma (JSON gövdesi, dosya yüklemesi yok):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notlar {#notes}

- Ya bir `templateId` ya da yüklenmiş bir görsel dosyası gereklidir. İkisi birden sağlanırsa şablon kullanılır.
- Şablonlar kendi metin kutusu konumlarını tanımlar; şablon kullanılırken `textLayout` parametresi göz ardı edilir.
- Metin, klasik meme görünümü için dış çizgi konturlarıyla SVG olarak işlenir.
- Açıkça ayarlanmadıysa font boyutu, metin kutusuna sığacak şekilde otomatik olarak hesaplanır.
- Boş metin kutuları atlanır (tüm kutular boşsa hiçbir işleme yapılmaz).
- Şablon kullanılırken çıktı dosya adı şablon kimliğini içerir (örn. `meme-drake.png`).
- HEIC, RAW, PSD ve SVG girdileri işlemden önce otomatik olarak çözülür.
