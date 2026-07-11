---
description: "Accélère ou ralentit une vidéo."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: ed48742a7fdb
---

# Video Speed {#video-speed}

Accélère ou ralentit une vidéo avec une option pour préserver la hauteur tonale de l'audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Multiplicateur de vitesse (0.25-4). Les valeurs supérieures à 1 accélèrent, inférieures à 1 ralentissent |
| keepPitch | boolean | No | `true` | Préserve la hauteur tonale de l'audio lors du changement de vitesse |

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

- Un facteur de `2` double la vitesse de lecture (réduit de moitié la durée). Un facteur de `0.5` réduit de moitié la vitesse de lecture (double la durée).
- Lorsque `keepPitch` vaut `true`, l'audio est étiré temporellement pour que les voix sonnent de façon naturelle. Lorsqu'il vaut `false`, la hauteur tonale se décale proportionnellement à la vitesse.
- La plage valide va de 0.25x à 4x.
