---
description: "Augmente ou diminue le volume audio d'un gain fixe en décibels."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: d9ac750b5475
---

# Régler le volume {#volume-adjust}

Augmente ou diminue le volume d'un fichier audio en appliquant un gain fixe en décibels.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | Non | `3` | Ajustement du volume en décibels (-30 à 30) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
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

## Remarques {#notes}

- Les valeurs positives augmentent le volume ; les valeurs négatives le diminuent.
- Des gains positifs importants peuvent provoquer de l'écrêtage. Utilisez normalize-audio pour un nivellement sûr de la sonie.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées uniquement décodables non prises en charge basculent vers MP3.
