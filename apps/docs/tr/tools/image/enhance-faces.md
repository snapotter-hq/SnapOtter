---
description: "GFPGAN ve CodeFormer AI modelleriyle görüntülerdeki bulanık veya düşük kaliteli yüzleri geri yükleyin ve keskinleştirin."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 8d35bc621921
---

# Yüz İyileştirme {#face-enhancement}

AI modelleri (GFPGAN/CodeFormer) kullanarak görüntülerdeki yüzleri geri yükleyin ve iyileştirin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` yoklaması yapın)

**Model paketleri:** `upscale-enhance` (5-6 GB) ve `face-detection` (200-300 MB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görüntü dosyası (çok parçalı) |
| model | string | Hayır | `"auto"` | Kullanılacak model: `auto`, `gfpgan`, `codeformer` |
| strength | number | Hayır | `0.8` | İyileştirme gücü (0-1). Daha yüksek değerler daha güçlü iyileştirme üretir |
| onlyCenterFace | boolean | Hayır | `false` | Yalnızca en merkezi/belirgin yüzü iyileştir |
| sensitivity | number | Hayır | `0.5` | Yüz algılama duyarlılığı (0-1) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## Yanıt {#response}

### İlk Yanıt (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### İlerleme (`/api/v1/jobs/{jobId}/progress` konumunda SSE) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notlar {#notes}

- Hem `upscale-enhance` model paketini (5-6 GB) hem de `face-detection` model paketini (200-300 MB) gerektirir.
- GFPGAN daha agresif iyileştirme üretir; CodeFormer kimliği daha iyi korur. `auto`, giriş için en iyi modeli seçer.
- Çıktı, maksimum kalite için her zaman PNG biçimindedir.
- Daha hızlı ön uç görüntüleme için tam çözünürlüklü çıktının yanı sıra bir WebP önizlemesi oluşturulur.
- `strength` parametresi, iyileştirilmiş yüzü orijinaliyle harmanlar. İnce iyileştirmeler için daha düşük değerler (0.3-0.5), daha güçlü geri yükleme için daha yüksek değerler (0.7-1.0) kullanın.
- Otomatik çözme yoluyla HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini destekler.
