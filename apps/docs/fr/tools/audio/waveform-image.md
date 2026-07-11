---
description: "Génère une visualisation de forme d'onde en image PNG à partir d'un fichier audio."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 2f164b1945d5
---

# Image de forme d'onde {#waveform-image}

Génère une visualisation de forme d'onde en image PNG à partir d'un fichier audio, avec des dimensions et une couleur configurables.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Non | `1024` | Largeur de l'image en pixels (256 à 3840) |
| height | integer | Non | `256` | Hauteur de l'image en pixels (64 à 1080) |
| color | string | Non | `"#4f46e5"` | Couleur hexadécimale de la forme d'onde (par ex. `"#4f46e5"`) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Remarques {#notes}

- La sortie est toujours une image PNG, quel que soit le format audio d'entrée.
- La forme d'onde est rendue sur un fond transparent.
- Utile pour les vignettes, les aperçus sur les réseaux sociaux ou l'intégration dans des pages web.
