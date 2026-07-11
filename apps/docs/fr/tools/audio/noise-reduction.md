---
description: "Réduire le bruit de fond de l'audio avec un débruitage basé sur la FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 2c2cc019e55d
---

# Réduction du bruit {#noise-reduction}

Réduire le bruit de fond d'un fichier audio à l'aide d'un débruitage basé sur la FFT, avec une intensité sélectionnable.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| strength | string | Non | `"medium"` | Intensité du débruitage : `light`, `medium`, `strong` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` préserve plus de détails mais retire moins de bruit. `strong` retire plus de bruit mais peut introduire de subtils artefacts.
- Meilleurs résultats sur des enregistrements présentant un bruit de fond constant (ronronnement de ventilateur, climatisation, statique).
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées à décodage seul non prises en charge se replient sur le MP3.
