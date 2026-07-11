---
description: "Convertir entre mono et stéréo ou intervertir les canaux gauche et droit."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 52a4d4eafb6c
---

# Canaux audio {#audio-channels}

Convertir l'audio entre les dispositions mono et stéréo, ou intervertir les canaux gauche et droit d'un fichier stéréo.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Oui | - | Opération sur les canaux : `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- `stereo-to-mono` mixe les deux canaux en une seule piste mono.
- `mono-to-stereo` duplique le canal mono vers la gauche et la droite.
- `swap` échange les canaux gauche et droit d'un fichier stéréo.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées à décodage seul non prises en charge se replient sur le MP3.
