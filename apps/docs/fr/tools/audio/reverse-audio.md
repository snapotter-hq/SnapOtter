---
description: "Inverser un fichier audio pour qu'il soit lu à l'envers."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 0233725da70e
---

# Inverser l'audio {#reverse-audio}

Inverser un fichier audio pour qu'il soit lu à l'envers.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. L'intégralité du fichier audio est inversée.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- La piste audio complète est inversée de la fin vers le début.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées à décodage seul non prises en charge se replient sur le MP3.
