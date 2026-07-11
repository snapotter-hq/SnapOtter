---
description: "Trwałe wtapianie napisów w klatki wideo."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 404b9078bb8e
---

# Burn Subtitles {#burn-subtitles}

Trwale renderuje (wtapia na stałe) napisy z pliku SRT, VTT lub ASS na każdą klatkę wideo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Przyjmuje dane formularza multipart z plikiem wideo i plikiem napisów. To jest endpoint asynchroniczny - zwraca `202 Accepted` natychmiast, a postęp jest przesyłany strumieniowo przez SSE pod `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| fontSize | integer | Nie | `24` | Rozmiar czcionki napisów w pikselach (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Prześlij dwa pliki: pierwszy musi być wideo, drugi musi być plikiem napisów (.srt, .vtt lub .ass).
- Wtopione napisy stają się trwałą częścią wideo i nie mogą zostać wyłączone przez widza. Aby uzyskać przełączalne napisy, użyj zamiast tego narzędzia Embed Subtitles.
- Aktualizacje postępu są dostępne przez SSE pod `GET /api/v1/jobs/{jobId}/progress` aż do zakończenia zadania.
