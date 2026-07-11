---
description: "Ajouter des effets de fondu en ouverture et en fermeture à l'audio."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 7afeec52bfee
---

# Fondu audio {#fade-audio}

Ajouter des effets de fondu en ouverture et en fermeture au début et à la fin d'un fichier audio.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Non | `1` | Durée du fondu en ouverture en secondes (0 à 30) |
| fadeOutS | number | Non | `1` | Durée du fondu en fermeture en secondes (0 à 30) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Réglez l'une ou l'autre des valeurs sur `0` pour ignorer ce sens de fondu. Au moins une doit être supérieure à 0.
- La durée du fondu est bornée à la longueur de l'audio si elle la dépasse.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées à décodage seul non prises en charge se replient sur le MP3.
