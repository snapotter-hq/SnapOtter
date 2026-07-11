---
description: "Découpe une section d'un fichier audio en spécifiant les temps de début et de fin."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: d2a8af2e0e7f
---

# Rogner l'audio {#trim-audio}

Découpe une section d'un fichier audio en spécifiant les temps de début et de fin en secondes.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| startS | number | Non | `0` | Temps de début en secondes (minimum 0) |
| endS | number | Oui | - | Temps de fin en secondes (doit être postérieur au début) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Remarques {#notes}

- Les temps sont spécifiés en secondes et peuvent inclure des décimales (par ex. `10.5`).
- La valeur `endS` doit être supérieure à `startS`.
- Si `endS` dépasse la durée de l'audio, le fichier est rogné jusqu'à la fin.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées uniquement décodables non prises en charge basculent vers MP3.
