---
description: "Zmiana liczby klatek na sekundę wideo."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 0f43c195ee85
---

# Change FPS {#change-fps}

Zmienia liczbę klatek na sekundę wideo na wartość docelową z zakresu od 1 do 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| fps | number | Nie | `30` | Docelowa liczba klatek na sekundę (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Obniżenie liczby klatek pomija klatki i zmniejsza rozmiar pliku. Zwiększenie jej powiela klatki, aby wypełnić lukę, ale nie dodaje rzeczywistych szczegółów ruchu.
- Typowe wartości docelowe: 24 (kino), 30 (web/transmisja), 60 (płynne odtwarzanie).
- Ścieżka audio jest zachowywana z jej oryginalną częstotliwością próbkowania.
