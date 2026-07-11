---
description: "Dodaj jednolite kolorowe pasy, aby dopasować do docelowych proporcji obrazu."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 7410d0220c2a
---

# Aspect Pad {#aspect-pad}

Dodaj jednolite kolorowe pasy typu letterbox lub pillarbox, aby dopasować film do docelowych proporcji obrazu bez przycinania.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Przyjmuje dane formularza multipart z plikiem wideo oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | Docelowe proporcje obrazu: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | Kolor szesnastkowy pasów wypełnienia (np. `"#000000"` dla czerni) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Jeśli film już odpowiada docelowym proporcjom obrazu, plik jest zwracany bez zmian.
- Użyj `9:16` dla pionowych/portretowych formatów mediów społecznościowych (TikTok, Reels, Shorts).
- Aby uzyskać rozmyte wypełnienie zamiast jednolitego koloru, użyj narzędzia Blur Pad.
