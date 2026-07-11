---
description: "Siyah beyaz veya gri tonlamalı fotoğrafları DDColor AI modeliyle otomatik olarak renklendirin."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 19fc5a1ea89b
---

# AI Renklendirme {#ai-colorization}

Siyah beyaz veya gri tonlamalı fotoğrafları AI kullanarak (OpenCV DNN yedeği ile DDColor modeli) tam renkli hale getirin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` yoklaması yapın)

**Model paketi:** `object-eraser-colorize` (1-2 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görüntü dosyası (çok parçalı) |
| intensity | number | Hayır | `1.0` | Renk yoğunluğu (0-1). Daha düşük değerler daha ince renklendirme üretir |
| model | string | Hayır | `"auto"` | Kullanılacak model: `auto`, `ddcolor`, `opencv` |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notlar {#notes}

- `object-eraser-colorize` model paketinin kurulu olmasını gerektirir (1-2 GB).
- DDColor daha yüksek kaliteli sonuçlar üretir ancak daha yavaştır; OpenCV DNN biraz daha düşük kaliteyle daha hızlıdır. `auto`, kullanılabilir olduğunda OpenCV yedeği ile DDColor kullanır.
- `intensity` parametresi, orijinal gri tonlama ile AI ile renklendirilmiş sonuç arasında harmanlama yapar. Tam renk için 1.0, kısmen doygunluğu azaltılmış vintage bir görünüm için daha düşük değerler kullanın.
- Çıktı biçimi otomatik olarak giriş biçimiyle eşleşir.
- Tarayıcıda önizlenemeyen çıktı biçimleri için ana çıktının yanı sıra bir WebP önizlemesi oluşturulur.
- Otomatik çözme yoluyla HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini destekler.
