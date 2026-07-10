---
description: "Accélérer ou ralentir la lecture audio à l'aide d'un multiplicateur."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 0f2f8d4b8b67
---

# Vitesse audio {#audio-speed}

Accélérer ou ralentir la lecture audio en appliquant un multiplicateur de vitesse.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| factor | number | Non | `1.5` | Multiplicateur de vitesse (0,25 à 4). Les valeurs inférieures à 1 ralentissent ; supérieures à 1 accélèrent. |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Notes {#notes}

- Un facteur de `0.25` lit à quart de vitesse (4x plus long). Un facteur de `4` lit à quadruple vitesse (4x plus court).
- La hauteur est préservée pendant les changements de vitesse (time-stretch). Utilisez le pitch-shift pour ajuster la hauteur indépendamment.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées à décodage seul non prises en charge se replient sur le MP3.
