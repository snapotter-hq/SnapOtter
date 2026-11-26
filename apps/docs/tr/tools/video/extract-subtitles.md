---
description: "Bir videodaki altyazı parçasını SRT, WebVTT veya ASS dosyası olarak çıkarın."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: d15c6625f604
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Gömülü altyazı parçasını bir video konteynerinden çıkarın ve SRT, WebVTT veya ASS dosyası olarak indirin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Bir video dosyası ve isteğe bağlı bir `settings` JSON dizgesi içeren multipart form data kabul eder.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Çıktı formatı: `srt`, `vtt` (WebVTT) veya `ass` |

Video konteynerinde bulunan ilk altyazı parçası çıkarılır.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Video, gömülü bir altyazı parçası içermelidir. Altyazı parçası bulunamazsa, istek 400 hatası döndürür.
- Videoda birden fazla altyazı parçası varsa, ilki çıkarılır.
- Metin parçaları (SubRip, ASS, mov_text, WebVTT) üç çıktı formatından herhangi birine dönüştürülebilir. Bir ASS parçasını SRT veya WebVTT'ye dönüştürmek konumlandırmasını ve efektlerini kaldırır.
- Görüntü tabanlı parçalar (Blu-ray PGS, DVD VobSub) OCR olmadan metne dönüştürülemez ve 422 hatası döndürür.
