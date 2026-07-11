---
description: "Générez un graphique d'histogramme RVB avec des statistiques par canal à partir d'une image."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 20ba174678a7
---

# Histogramme {#histogram}

Générez un graphique d'histogramme RVB à partir d'une image. Renvoie une image d'histogramme PNG accompagnée de statistiques par canal et des données brutes d'histogramme à 256 classes dans le JSON de réponse.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Accepte des données de formulaire multipart avec une image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| scale | string | Non | `"linear"` | Échelle de l'axe Y : `linear` ou `log` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Notes {#notes}

- Le champ `downloadUrl` pointe vers un graphique d'histogramme PNG rendu montrant les distributions R, V, B et de luminance.
- `bins` contient des tableaux bruts de 256 valeurs pour chaque canal (rouge, vert, bleu, luminance), adaptés au rendu de visualisations personnalisées.
- `stats` fournit la moyenne, la médiane et l'écart type par canal.
- `mean` et `max` sont des champs raccourcis rétrocompatibles.
- Utilisez l'échelle `log` lorsque l'histogramme est dominé par quelques pics et que vous souhaitez voir les détails dans les classes inférieures.
- Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant l'analyse.
