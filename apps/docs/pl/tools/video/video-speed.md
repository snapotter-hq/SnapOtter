---
description: "Przyspieszenie lub zwolnienie wideo."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 2aae17ee218e
---

# Video Speed {#video-speed}

Przyspiesza lub zwalnia wideo z opcją zachowania wysokości dźwięku audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| factor | number | Nie | `2` | Mnożnik prędkości (0.25-4). Wartości powyżej 1 przyspieszają, poniżej 1 zwalniają |
| keepPitch | boolean | Nie | `true` | Zachowanie wysokości dźwięku audio przy zmianie prędkości |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Współczynnik `2` podwaja prędkość odtwarzania (o połowę skraca czas trwania). Współczynnik `0.5` o połowę zmniejsza prędkość odtwarzania (podwaja czas trwania).
- Gdy `keepPitch` ma wartość `true`, audio jest rozciągane w czasie, aby głosy brzmiały naturalnie. Gdy `false`, wysokość dźwięku zmienia się proporcjonalnie do prędkości.
- Prawidłowy zakres to od 0.25x do 4x.
