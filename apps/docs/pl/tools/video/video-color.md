---
description: "Dostosowanie jasności, kontrastu, nasycenia i gammy wideo."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: bd325aa9972a
---

# Video Color {#video-color}

Dostosowuje jasność, kontrast, nasycenie i korekcję gammy wideo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| brightness | number | Nie | `0` | Dostosowanie jasności (-1 do 1) |
| contrast | number | Nie | `1` | Mnożnik kontrastu (0-4) |
| saturation | number | Nie | `1` | Mnożnik nasycenia (0-3). Ustaw na 0 dla skali szarości |
| gamma | number | Nie | `1` | Korekcja gammy (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Wszystkie wartości domyślne (jasność 0, kontrast 1, nasycenie 1, gamma 1) nie powodują żadnych zmian.
- Ustawienie nasycenia na `0` konwertuje wideo do skali szarości.
- Wartości gammy poniżej 1 rozjaśniają cienie, natomiast wartości powyżej 1 je przyciemniają.
