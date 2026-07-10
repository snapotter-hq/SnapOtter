---
description: "Combiner plusieurs fichiers audio en une seule piste séquentielle."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 0c63bdc49bcb
---

# Fusionner l'audio {#merge-audio}

Combiner deux fichiers audio ou plus en une seule piste séquentielle, concaténés dans l'ordre de leur envoi.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Accepte des données de formulaire multipart avec plusieurs fichiers audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Non | `"mp3"` | Format de sortie : `mp3`, `wav`, `flac`, `m4a` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Notes {#notes}

- Accepte de 2 à 10 fichiers audio par requête.
- Les fichiers sont concaténés dans l'ordre d'envoi.
- Tous les fichiers d'entrée sont réencodés au format de sortie et à la fréquence d'échantillonnage choisis pour un raccord sans coupure.
- Les formats d'entrée mixtes sont pris en charge (par exemple, un WAV et un MP3).
