---
description: "Découpe l'audio par intervalles de temps, parts égales ou détection de silence."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 7303c75d930d
---

# Découper l'audio {#split-audio}

Découpe un fichier audio en segments par intervalles de temps fixes, parts égales ou détection automatique du silence. Renvoie une archive ZIP des segments.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Non | `"time"` | Stratégie de découpage : `time`, `parts`, `silence` |
| segmentS | number | Non | `60` | Longueur de segment en secondes, 1 à 3600 (utilisé lorsque le mode est `time`) |
| parts | integer | Non | `2` | Nombre de parts égales, 2 à 20 (utilisé lorsque le mode est `parts`) |
| thresholdDb | number | Non | `-40` | Seuil de silence en dB, -80 à -20 (utilisé lorsque le mode est `silence`) |
| minSilenceS | number | Non | `0.3` | Écart de silence minimal en secondes, 0,1 à 10 (utilisé lorsque le mode est `silence`) |

## Exemple de requête {#example-request}

Découper en segments de 30 secondes :

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Découper par détection de silence :

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Remarques {#notes}

- Le `downloadUrl` pointe vers une archive ZIP contenant tous les segments.
- Seuls les paramètres pertinents pour le `mode` choisi sont utilisés ; les autres sont ignorés.
- Les noms de fichiers des segments sont numérotés de façon séquentielle (par ex. `part-000.mp3`, `part-001.mp3`).
- Le format de sortie correspond au format d'entrée.
