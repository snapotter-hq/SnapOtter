---
description: "Raster görüntüleri siyah-beyaz (potrace) ve tam renkli çok katmanlı vektörleştirme ile SVG'ye dönüştürün."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: de604f654255
---

# Görüntüden SVG'ye {#image-to-svg}

İzleme algoritmaları kullanarak raster görüntüleri SVG'ye vektörleştirin. Siyah-beyaz izlemeyi (potrace) ve tam renkli çok katmanlı vektörleştirmeyi destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| colorMode | string | Hayır | `"bw"` | İzleme modu: `bw` (siyah ve beyaz) veya `color` (çok renkli katmanlar) |
| threshold | number | Hayır | 128 | S&B modu için parlaklık eşiği (0 ile 255 arası). Altındaki pikseller siyah olur. |
| colorPrecision | number | Hayır | 6 | Renk modu için renk niceleme hassasiyeti (1 ile 16 arası). Daha yüksek değerler daha belirgin renk katmanları üretir. |
| layerDifference | number | Hayır | 6 | Renk modunda katmanlar arası minimum renk farkı (1 ile 128 arası) |
| filterSpeckle | number | Hayır | 4 | Piksel cinsinden izlenen şekiller için minimum alan (1 ile 256 arası). Gürültü/lekeleri kaldırır. |
| pathMode | string | Hayır | `"spline"` | Yol yumuşatma: `none` (pürüzlü), `polygon` (düz segmentler), `spline` (yumuşak eğriler) |
| cornerThreshold | number | Hayır | 60 | Renk modunda köşe algılama için açı eşiği (0 ile 180 derece arası) |
| invert | boolean | Hayır | `false` | İzlemeden önce görüntüyü tersine çevir (siyah/beyazı değiştir) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Renkli Vektörleştirme {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notlar {#notes}

- Giriş biçiminden bağımsız olarak çıktı her zaman bir SVG dosyasıdır.
- HEIC, RAW, PSD ve SVG giriş biçimlerini destekler (izlemeden önce otomatik olarak raster'a çözülür).
- S&B modu potrace algoritmasını kullanır. Görüntü önce gri tonlamaya dönüştürülür, ardından izlemeden önce saf siyah/beyaza eşiklenir.
- Renk modu çok katmanlı bir yaklaşım kullanır: görüntü renk katmanlarına nicelenir, her biri ayrı ayrı izlenir ve SVG çıktısında üst üste yığılır.
- Daha düşük `filterSpeckle` değerleri daha fazla ayrıntıyı korur ancak daha fazla yollu daha büyük SVG dosyaları üretir.
- `pathMode` ayarı dosya boyutunu önemli ölçüde etkiler: `none` en fazla yolu üretir, `spline` en yumuşak (ve genellikle en küçük) çıktıyı üretir.
- Logolar ve simgeler için en iyi sonuçlar için, temiz ve yüksek kontrastlı bir girdiyle S&B modunu kullanın. Fotoğraflar veya illüstrasyonlar için daha yüksek `colorPrecision` ile renk modunu kullanın.
