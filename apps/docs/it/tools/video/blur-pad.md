---
description: "Riempi le barre con una copia sfocata del video."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 714320713dfd
---

# Riempimento sfocato {#blur-pad}

Adatta un video a un rapporto d'aspetto di destinazione riempiendo l'area di riempimento con una copia sfocata e ridimensionata del video invece che con barre a tinta unita.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Accetta dati di form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | Rapporto d'aspetto di destinazione: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | Sigma della sfocatura gaussiana per lo sfondo (2-50) |

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

- Valori di sfocatura più alti producono uno sfondo più morbido e astratto. Valori più bassi mantengono visibili più dettagli.
- Se il video corrisponde già al rapporto d'aspetto di destinazione, il file viene restituito invariato.
- Per un riempimento a tinta unita, usa invece lo strumento Aspect Pad.
