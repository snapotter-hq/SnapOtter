---
description: "Convertir l'audio entre les formats MP3, WAV, OGG, FLAC et M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 9885ffa48ef0
---

# Convertir l'audio {#convert-audio}

Convertir des fichiers audio entre les formats courants, dont MP3, WAV, OGG, FLAC et M4A, avec un débit de sortie configurable.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Non | `"mp3"` | Format de sortie : `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Non | `192` | Débit de sortie en kbps (32 à 320) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Notes {#notes}

- Les formats d'entrée pris en charge incluent MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF et OPUS.
- Le débit ne s'applique qu'aux formats avec perte (MP3, OGG, M4A). Les formats sans perte comme WAV et FLAC ignorent ce paramètre.
- Le nom du fichier de sortie conserve le nom d'origine avec la nouvelle extension.
