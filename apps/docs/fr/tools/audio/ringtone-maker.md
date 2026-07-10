---
description: "Créer un extrait de sonnerie à partir de n'importe quel fichier audio."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: f54876511b98
---

# Créateur de sonneries {#ringtone-maker}

Créer un extrait de sonnerie (.m4r) à partir de n'importe quel fichier audio en sélectionnant un temps de départ et une durée.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| startS | number | Non | `0` | Temps de départ en secondes (minimum 0) |
| durationS | number | Non | `30` | Durée de l'extrait en secondes (1 à 30) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Notes {#notes}

- La sortie est toujours au format M4R, compatible avec les sonneries iPhone.
- La durée maximale d'une sonnerie est de 30 secondes (limite Apple).
- N'importe quel format audio peut servir d'entrée.
