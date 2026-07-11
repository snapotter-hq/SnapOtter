---
description: "Convertit la parole en texte grâce à une transcription assistée par IA."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 1d7bfa5a8cf3
---

# Transcrire l'audio {#transcribe-audio}

Convertit la parole en texte grâce à une transcription assistée par IA (faster-whisper). Prend en charge les formats de sortie texte brut, SRT et VTT, avec sélection automatique ou manuelle de la langue.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| language | string | Non | `"auto"` | Langue : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | Non | `"txt"` | Format de sortie : `txt`, `srt`, `vtt` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Exemple de réponse {#example-response}

C'est un outil asynchrone. L'API renvoie immédiatement `202 Accepted` :

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Suivez la progression via SSE à `GET /api/v1/jobs/{jobId}/progress`. Lorsque la tâche se termine, le flux SSE fournit le résultat final avec une `downloadUrl`.

## Remarques {#notes}

- Nécessite l'installation du pack de fonctionnalités **transcription**. Renvoie `501` avec le code `FEATURE_NOT_INSTALLED`, le `feature` manquant, `featureName` et `estimatedSize` si le pack n'est pas disponible.
- Utilise faster-whisper pour la transcription. La langue `auto` détecte automatiquement la langue parlée.
- Les formats `srt` et `vtt` incluent des horodatages pour chaque segment, adaptés aux sous-titres.
- Le format `txt` renvoie du texte brut sans horodatages.
- C'est un outil IA de longue durée ; le temps de traitement dépend de la longueur de l'audio et du matériel du serveur.
