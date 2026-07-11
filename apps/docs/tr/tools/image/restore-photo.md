---
description: "Restorasyon, yüz iyileştirme ve renk için bir yapay zeka boru hattıyla eski fotoğraflardaki çizik, yırtık ve hasarları onarın."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 382c7c7b99ee
---

# Fotoğraf Restorasyonu {#photo-restoration}

Çok adımlı bir yapay zeka boru hattı kullanarak eski fotoğraflardaki çizik, yırtık ve hasarları onarın. Çizik onarımı, yüz iyileştirme, gürültü giderme ve isteğe bağlı renklendirmeyi bir araya getirir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` sorgulayın)

**Model paketi:** `photo-restoration` (4-5 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (çok parçalı) |
| scratchRemoval | boolean | Hayır | `true` | Çizikleri ve yüzey hasarını kaldır |
| faceEnhancement | boolean | Hayır | `true` | Restore edilen fotoğraftaki yüzleri iyileştir |
| fidelity | number | Hayır | `0.7` | Yüz iyileştirme sadakati (0-1). Daha yüksek değerler orijinal özellikleri daha fazla korur |
| denoise | boolean | Hayır | `true` | Restore edilen sonuca gürültü giderme uygula |
| denoiseStrength | number | Hayır | `25` | Gürültü giderme gücü (0-100) |
| colorize | boolean | Hayır | `false` | Restore edilen fotoğrafı renklendir (gri tonlamalı görseller için) |
| colorizeStrength | number | Hayır | `85` | Renklendirme yoğunluğu (0-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

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
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notlar {#notes}

- `photo-restoration` model paketinin kurulu olmasını gerektirir (4-5 GB).
- Boru hattı birden fazla yapay zeka adımını sırayla yürütür: çizik onarımı, yüz iyileştirme (GFPGAN), gürültü giderme ve isteğe bağlı olarak renklendirme.
- Sonuçtaki `steps` dizisi, gerçekte hangi işleme adımlarının yürütüldüğünü gösterir.
- `scratchCoverage`, görsel alanının çizik hasarı olan tahmini yüzdesidir.
- `fidelity`, yüzlerin orijinal görünümü koruma karşısında ne kadar güçlü iyileştirileceğini denetler. Daha düşük değerler daha agresif iyileştirme üretir; daha yüksek değerler daha korumacıdır.
- `colorize` seçeneği, görselin gri tonlamalı olup olmadığını otomatik olarak algılar. Sonuçtaki `isGrayscale` bayrağı bu algılamayı doğrular.
- Çıktı biçimi girdi biçimiyle otomatik olarak eşleşir.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR ve AVIF girdi biçimlerini otomatik çözme yoluyla destekler.
