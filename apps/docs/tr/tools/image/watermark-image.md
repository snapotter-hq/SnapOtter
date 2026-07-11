---
description: "Yapılandırılabilir konum, opaklık ve ölçekle bir logo veya görüntüyü filigran olarak yerleştirin."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: f0bc773265df
---

# Görüntü Filigranı {#image-watermark}

Bir logo veya ikincil görüntüyü bir temel görüntü üzerinde filigran olarak yerleştirin. Filigran, temel görüntü genişliğine göre ölçeklenir ve bir köşede veya merkezde konumlandırılır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

**İki** görüntü dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| position | string | Hayır | `"bottom-right"` | Filigran yerleşimi: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | Hayır | `50` | Filigran opaklık yüzdesi (0 ile 100 arası) |
| scale | number | Hayır | `25` | Ana görüntü genişliğinin yüzdesi olarak filigran genişliği (1 ile 100 arası) |

### Dosya Alanları {#file-fields}

| Alan Adı | Zorunlu | Açıklama |
|------------|----------|-------------|
| file | Evet | Ana/temel görüntü |
| watermark | Evet | Filigran/logo görüntüsü |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notlar {#notes}

- Her iki görüntü de doğrulanır ve çözülür (HEIC, RAW, PSD, SVG desteklenir).
- Filigran, genişliği ana görüntü genişliğinin %`scale`'sine eşit olacak şekilde orantılı olarak yeniden boyutlandırılır.
- Opaklık, `dest-in` harmanlamayla birleştirilen bir alfa maskesi aracılığıyla uygulanır.
- Köşe konumları görüntü kenarından 20px dolgu kullanır.
- Filigran görüntüsünde saydamlık varsa (örn. bir PNG logosu), birleştirme sırasında korunur.
- İşlemeden önce her iki görüntüde de EXIF yönü otomatik olarak uygulanır.
