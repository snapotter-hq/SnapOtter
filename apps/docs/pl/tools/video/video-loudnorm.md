---
description: "Normalizacja głośności audio wideo do standardu transmisyjnego."
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: 71fe7bfb8be2
---

# Normalizuj audio wideo {#normalize-audio}

Normalizuje głośność audio wideo do standardu głośności transmisyjnej EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Przyjmuje dane formularza multipart z plikiem wideo. To narzędzie nie ma konfigurowalnych ustawień.

## Parameters {#parameters}

To narzędzie nie ma parametrów. Stosuje normalizację głośności EBU R128 do ścieżki audio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Używa filtra `loudnorm` FFmpeg celującego w zintegrowaną głośność -16 LUFS z prawdziwym szczytem -1.5 dBTP i zakresem głośności 11 LU (standard transmisyjny EBU R128).
- Częstotliwość próbkowania źródłowego audio jest zachowywana na wyjściu.
- Jeśli wideo nie ma ścieżki audio, żądanie zwraca błąd 400.
