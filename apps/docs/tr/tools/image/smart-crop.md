---
description: "Sharp ve AI yüz algılama kullanarak görüntüleri akıllıca çerçeveleyen özne, yüz ve entropi farkındalıklı kırpma."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: a0cecd8b79a9
---

# Akıllı Kırpma {#smart-crop}

Akıllı özne farkındalıklı, yüz farkındalıklı veya kırpma tabanlı kesme. Akıllı çerçeveleme için Sharp'ın dikkat/entropi stratejilerini ve AI yüz algılamayı kullanır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**İşleme:** Eşzamansız (202 döner, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` üzerinden sorgulanır)

**Model paketi:** `face-detection` (200-300 MB) - yalnızca `face` modu için gereklidir

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görüntü dosyası (multipart) |
| mode | string | Hayır | `"subject"` | Kırpma modu: `subject`, `face`, `trim`. (Eski değerler `attention` ve `content`, `subject` ve `trim` değerlerine eşlenir) |
| strategy | string | Hayır | `"attention"` | Özne modu için strateji: `attention` veya `entropy` |
| width | integer | Hayır | - | Piksel cinsinden hedef genişlik |
| height | integer | Hayır | - | Piksel cinsinden hedef yükseklik |
| padding | integer | Hayır | `0` | Özne çevresindeki dolgu yüzdesi (0-50) |
| facePreset | string | Hayır | `"head-shoulders"` | Yüz çerçeveleme ön ayarı: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Hayır | `0.5` | Yüz algılama duyarlılığı (0-1) |
| threshold | integer | Hayır | `30` | Arka plan algılama için kırpma modu eşiği (0-255) |
| padToSquare | boolean | Hayır | `false` | Kırpılmış sonucu bir kareye dolgu ile tamamla |
| padColor | string | Hayır | `"#ffffff"` | Dolgu için arka plan rengi |
| targetSize | integer | Hayır | - | Dolgulu çıktı için hedef boyut (piksel) |
| quality | integer | Hayır | - | Çıktı kalitesi (1-100) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modlar {#modes}

### Özne Modu {#subject-mode}
Görsel olarak en ilgi çekici bölgeyi bulmak için Sharp'ın dikkat veya entropi stratejisini kullanır ve etrafında kırpar.

### Yüz Modu {#face-mode}
AI kullanarak yüzleri algılar, ardından belirtilen `facePreset` kullanarak kırpmayı algılanan yüzlerin etrafında çerçeveler. Hiçbir yüz algılanmazsa özne moduna (dikkat stratejisi) geri döner.

### Kırpma Modu {#trim-mode}
Görüntüden düzgün kenarlıkları/arka planı kaldırır. İsteğe bağlı olarak sonucu belirtilen bir arka plan rengi ve hedef boyutla bir kareye dolgu ile tamamlar.

## Notlar {#notes}

- Bu araç `executionHint: "long"` ile `createToolRoute` fabrikasını kullanır, bu nedenle SSE ilerlemesiyle 202 döner.
- Yüz modu `face-detection` model paketini gerektirir (200-300 MB).
- Özne ve kırpma modları herhangi bir AI model paketi olmadan çalışır.
- `facePreset` değeri, kırpmanın algılanan yüzleri ne kadar sıkı çerçevelediğini belirler: `closeup` en sıkı, `half-body` en geniş olanıdır.
- Genişlik/yükseklik belirtilmezse varsayılan olarak 1080x1080 kullanılır.
