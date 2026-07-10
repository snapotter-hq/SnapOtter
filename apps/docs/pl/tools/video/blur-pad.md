---
description: "Wypełnij pasy rozmytą kopią filmu."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 19580016b336
---

# Blur Pad {#blur-pad}

Dopasuj film do docelowych proporcji obrazu, wypełniając obszar wypełnienia rozmytą, przeskalowaną kopią filmu zamiast jednolitych kolorowych pasów.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Przyjmuje dane formularza multipart z plikiem wideo oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | Docelowe proporcje obrazu: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | Sigma rozmycia gaussowskiego dla tła (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Wyższe wartości rozmycia dają bardziej miękkie, bardziej abstrakcyjne tło. Niższe wartości zachowują więcej widocznych szczegółów.
- Jeśli film już odpowiada docelowym proporcjom obrazu, plik jest zwracany bez zmian.
- Aby uzyskać jednolite kolorowe wypełnienie, użyj zamiast tego narzędzia Aspect Pad.
