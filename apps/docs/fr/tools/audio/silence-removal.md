---
description: "Supprime les sections silencieuses d'un fichier audio."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: acb9cae0a9f2
---

# Suppression du silence {#silence-removal}

Détecte et supprime les sections silencieuses d'un fichier audio en fonction d'un seuil et d'une durée minimale configurables.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | Non | `-50` | Seuil de silence en dB (-80 à -20). L'audio en dessous de ce niveau est considéré comme silencieux. |
| minSilenceS | number | Non | `0.5` | Durée minimale de silence en secondes à supprimer (0,1 à 5) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Remarques {#notes}

- Un seuil plus élevé (moins négatif) est plus agressif et supprime aussi bien les passages plus discrets que le silence réel.
- Augmentez `minSilenceS` pour ne supprimer que les pauses plus longues tout en conservant les courts silences naturels.
- Utile pour nettoyer des enregistrements de podcasts, des cours et des mémos vocaux.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées uniquement décodables non prises en charge basculent vers MP3.
