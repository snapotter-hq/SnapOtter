---
description: "Gizlilik ve GDPR uyumlu anonimleştirme için AI yüz algılamayla görsellerdeki yüzleri otomatik algılayıp bulanıklaştırın."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: bd0aa1e11901
---

# Yüz / PII Bulanıklaştırma {#face-pii-blur}

AI destekli yüz algılama (MediaPipe) kullanarak görsellerdeki yüzleri otomatik algılayın ve bulanıklaştırın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**İşleme:** Eşzamansız (202 döndürür, durum için `/api/v1/jobs/{jobId}/progress` SSE üzerinden yoklanır)

**Model paketi:** `face-detection` (200-300 MB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | dosya | Evet | - | Görsel dosyası (multipart) |
| blurRadius | sayı | Hayır | `30` | Algılanan yüzlere uygulanan bulanıklık yarıçapı (1-100) |
| sensitivity | sayı | Hayır | `0.5` | Yüz algılama hassasiyeti (0-1). Daha düşük değerler daha yüksek güvenle daha az yüz algılar |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
```

## Yanıt {#response}

### İlk Yanıt (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### İlerleme (`/api/v1/jobs/{jobId}/progress` adresinde SSE) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Nihai Sonuç (SSE üzerinden) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Yüz Algılanmadı {#no-faces-detected}

Hiç yüz bulunmazsa, sonuç bir uyarı içerir:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Notlar {#notes}

- `face-detection` model paketinin yüklü olmasını gerektirir (200-300 MB).
- Çıktı biçimi giriş biçimiyle otomatik olarak eşleşir.
- `faces` dizisi, algılanan her yüz için sınırlayıcı kutu koordinatlarını (x, y, genişlik, yükseklik) içerir.
- Kısmen örtülü olanlar dahil daha fazla yüz algılamak için `sensitivity` değerini artırın (1.0'a yaklaştırın).
- Otomatik çözme yoluyla HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini destekler.
