---
description: "Çok kademeli kalite seçenekleriyle yapay zeka destekli gürültü ve grenlilik giderme."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 5e0db53abd3c
---

# Gürültü Giderme {#noise-removal}

Python yardımcı bileşenini (SCUNet modeli) kullanan, çok kademeli kalite seçenekleriyle yapay zeka destekli gürültü ve grenlilik giderme.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` sorgulayın)

**Model paketi:** `upscale-enhance` (5-6 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (çok parçalı) |
| tier | string | Hayır | `"balanced"` | Kalite kademesi: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | Hayır | `50` | Gürültü giderme gücü (0-100) |
| detailPreservation | number | Hayır | `50` | Ne kadar ayrıntının korunacağı (0-100). Daha yüksek değerler daha fazla doku korur |
| colorNoise | number | Hayır | `30` | Renk gürültüsü azaltma gücü (0-100) |
| format | string | Hayır | `"original"` | Çıktı biçimi: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Hayır | `90` | Çıktı kodlama kalitesi (1-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notlar {#notes}

- `upscale-enhance` model paketinin kurulu olmasını gerektirir (5-6 GB).
- Kalite kademeleri hız ile kaliteyi dengeler: `quick` temel gürültü gidermeyle en hızlısıdır, `maximum` en kapsamlı çok geçişli yaklaşımı kullanır.
- `detailPreservation` parametresi dokulu özneler (kumaş, saç, yapraklar) için kritiktir. Daha yüksek değerler, gürültü gidericinin ince ayrıntıyı düzleştirip yok etmesini önler.
- `format` değeri `"original"` olarak ayarlandığında çıktı biçimi girdi dosyası biçimiyle eşleşir.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR girdi biçimlerini otomatik çözme yoluyla destekler.
