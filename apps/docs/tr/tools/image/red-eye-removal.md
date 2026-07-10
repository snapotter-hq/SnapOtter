---
description: "Kamera flaşının neden olduğu kırmızı gözün yapay zeka destekli algılanması ve düzeltilmesi."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 8419d2378269
---

# Kırmızı Göz Giderme {#red-eye-removal}

Kamera flaşının neden olduğu kırmızı gözün yapay zeka destekli algılanması ve düzeltilmesi.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` sorgulayın)

**Model paketi:** `face-detection` (200-300 MB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (çok parçalı) |
| sensitivity | number | Hayır | `50` | Kırmızı göz algılama duyarlılığı (0-100). Daha yüksek değerler daha ince kırmızı gözü algılar |
| strength | number | Hayır | `70` | Düzeltme gücü (0-100). Kırmızının ne kadar agresif nötralize edileceği |
| format | string | Hayır | - | Çıktı biçimi (isteğe bağlı geçersiz kılma) |
| quality | number | Hayır | `90` | Çıktı kalitesi (1-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notlar {#notes}

- `face-detection` model paketinin kurulu olmasını gerektirir (200-300 MB).
- Önce yüzleri algılar, ardından her yüz içindeki göz bölgelerini bulur ve son olarak kırmızı göz piksellerini belirleyip düzeltir.
- `facesDetected` sayısı kaç yüz bulunduğunu gösterir; `eyesCorrected`, kırmızı gözü düzeltilen bireysel gözlerin toplam sayısıdır.
- Çıktı, maksimum kalite koruması için her zaman PNG'dir.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR girdi biçimlerini otomatik çözme yoluyla destekler.
