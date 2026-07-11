---
description: "İnce ayrıntıyı korurken Real-ESRGAN AI süper çözünürlüğü ile görüntüleri 2x'ten 4x'e büyütün."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: feb5dce7f857
---

# Görüntü Büyütme {#image-upscaling}

Real-ESRGAN kullanarak AI süper çözünürlük geliştirmesi. Ayrıntıyı korurken görüntüleri 2x-4x büyütür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**İşleme:** Eşzamansız (202 döner, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` üzerinden sorgulanır)

**Model paketi:** `upscale-enhance` (5-6 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görüntü dosyası (multipart) |
| scale | number | Hayır | `2` | Büyütme faktörü (örn. 2, 3, 4) |
| model | string | Hayır | `"auto"` | Kullanılacak model (örn. `auto`, belirli model adları) |
| faceEnhance | boolean | Hayır | `false` | Büyütme sırasında yüz geliştirme uygula |
| denoise | number | Hayır | `0` | Gürültü azaltma gücü (0 = kapalı) |
| format | string | Hayır | `"auto"` | Çıktı biçimi: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Hayır | `95` | Çıktı kalitesi (1-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Yanıt {#response}

### İlk Yanıt (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### İlerleme (`/api/v1/jobs/{jobId}/progress` üzerinde SSE) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notlar {#notes}

- `upscale-enhance` model paketinin kurulmuş olmasını gerektirir (5-6 GB).
- Mevcut olduğunda Real-ESRGAN kullanır; AI modeli kullanılamıyorsa Lanczos interpolasyonuna geri döner.
- `faceEnhance` seçeneği, daha iyi yüz kalitesi için büyütme sırasında GFPGAN yüz onarımı uygular.
- Tarayıcıda önizlenemeyen çıktı biçimleri (HEIC, JXL, TIFF) için ana çıktının yanında bir WebP önizlemesi oluşturulur.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini otomatik çözme yoluyla destekler.
