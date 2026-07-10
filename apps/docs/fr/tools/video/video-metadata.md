---
description: "Supprime les métadonnées d'une vidéo et signale ce qui a été trouvé."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 6dc127077d64
---

# Clean Video Metadata {#clean-video-metadata}

Supprime les métadonnées (date de création, coordonnées GPS, modèle d'appareil, balises logicielles, etc.) d'une vidéo et signale ce qui a été supprimé.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Accepte des données de formulaire multipart avec un fichier vidéo. Cet outil n'a aucun réglage configurable.

## Parameters {#parameters}

Cet outil n'a aucun paramètre. Il supprime toutes les métadonnées du conteneur vidéo.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- Les métadonnées supprimées incluent les horodatages de création, les données GPS/de localisation, les informations sur l'appareil/le périphérique et les balises logicielles.
- Les flux vidéo et audio sont copiés sans réencodage, il n'y a donc aucune perte de qualité.
- Utile pour la confidentialité avant de partager des vidéos publiquement.
