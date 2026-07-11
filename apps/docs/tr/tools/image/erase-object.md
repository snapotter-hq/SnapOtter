---
description: "AI boyama (LaMa) ile görüntülerden istenmeyen nesneleri, silinecek bölgenin bir maskesiyle yönlendirilerek kaldırın."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: a7aed8658bc5
---

# Nesne Silici {#object-eraser}

AI boyama (LaMa modeli) kullanarak görüntülerden istenmeyen nesneleri kaldırın. Bir görüntü ve silinecek bölgeyi belirten bir maske kabul eder.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` yoklaması yapın)

**Model paketi:** `object-eraser-colorize` (1-2 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Kaynak görüntü dosyası (çok parçalı) |
| mask | file | Evet | - | Maske görüntüsü (beyaz = silinecek alan, siyah = korunacak). `mask` alan adıyla yüklenmelidir |
| format | string | Hayır | `"auto"` | Çıktı biçimi: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Hayır | `95` | Çıktı kalitesi (1-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notlar {#notes}

- `object-eraser-colorize` model paketinin kurulu olmasını gerektirir (1-2 GB).
- Maske, kaynak görüntüyle aynı boyutlarda olmalıdır. Beyaz pikseller silinecek alanları gösterir; AI bunları makul içerikle doldurur.
- Yüksek kaliteli nesne kaldırma için LaMa (Large Mask Inpainting) kullanır.
- Tarayıcıda önizlenemeyen çıktı biçimleri için ana çıktının yanı sıra bir WebP önizlemesi oluşturulur.
- Otomatik çözme yoluyla HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini destekler.
