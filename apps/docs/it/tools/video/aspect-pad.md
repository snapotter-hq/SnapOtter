---
description: "Aggiungi barre a tinta unita per adattarsi a un rapporto d'aspetto di destinazione."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 158b2a90b9e3
---

# Riempimento del rapporto d'aspetto {#aspect-pad}

Aggiungi barre letterbox o pillarbox a tinta unita per adattare un video a un rapporto d'aspetto di destinazione senza ritagliare.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Accetta dati di form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | Rapporto d'aspetto di destinazione: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | Colore esadecimale per le barre di riempimento (es. `"#000000"` per il nero) |

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

- Se il video corrisponde già al rapporto d'aspetto di destinazione, il file viene restituito invariato.
- Usa `9:16` per i formati verticali/ritratto dei social media (TikTok, Reels, Shorts).
- Per un riempimento sfocato invece che a tinta unita, usa lo strumento Blur Pad.
