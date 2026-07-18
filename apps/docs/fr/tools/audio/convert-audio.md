---
description: "Convertir l'audio entre les formats MP3, WAV, OGG, FLAC et M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 9885ffa48ef0
---

# Convertir l'audio {#convert-audio}

Convertir des fichiers audio entre les formats courants, dont MP3, WAV, OGG, FLAC et M4A, avec un débit de sortie et une fréquence d'échantillonnage configurables.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Non | `"mp3"` | Format de sortie : `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Non | `192` | Débit de sortie en kbps (32 à 320) |
| sampleRate | integer | Non | fréquence d'origine | Fréquence d'échantillonnage de sortie en Hz : `8000`, `16000`, `22050`, `32000`, `44100`, `48000` ou `96000`. Omettre pour conserver la fréquence d'origine |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Les formats d'entrée pris en charge incluent MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF et OPUS.
- Le débit ne s'applique qu'aux formats avec perte (MP3, OGG, M4A). Les formats sans perte comme WAV et FLAC ignorent ce paramètre.
- La sortie MP3 prend en charge les fréquences d'échantillonnage jusqu'à 48000 Hz. L'option 96000 Hz ne s'applique qu'aux formats WAV, OGG, FLAC et M4A.
- Le débit MP3 est plafonné par la fréquence d'échantillonnage : au maximum 64 kbps à 8000 Hz et 160 kbps à 16000 ou 22050 Hz. Les requêtes dépassant ce plafond sont rejetées au lieu d'être abaissées silencieusement.
- Le nom du fichier de sortie conserve le nom d'origine avec la nouvelle extension.
