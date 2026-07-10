---
description: "Générer des fichiers de sous-titres à partir des pistes audio d'une vidéo à l'aide de l'IA."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 979fd7cb561a
---

# Sous-titres automatiques {#auto-subtitles}

Générez des fichiers de sous-titres à partir de la piste audio d'une vidéo à l'aide de la reconnaissance vocale assistée par IA (faster-whisper). Prend en charge la détection automatique et 10 langues explicites.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Accepte des données de formulaire multipart avec un fichier vidéo et un champ `settings` au format JSON. Il s'agit d'un point de terminaison asynchrone : il renvoie `202 Accepted` immédiatement et la progression est diffusée via SSE à `GET /api/v1/jobs/{jobId}/progress`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| language | string | Non | `"auto"` | Langue de la parole : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Non | `"srt"` | Format de sous-titres de sortie : `srt`, `vtt` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Remarques {#notes}

- Il s'agit d'un outil d'IA qui nécessite l'installation du pack de fonctionnalités **transcription**. Si le pack n'est pas installé, l'API renvoie `501 Feature Not Installed` avec des instructions pour l'installer via l'interface d'administration.
- L'option de langue `auto` utilise la détection de langue intégrée de whisper. Spécifier explicitement la langue améliore la précision et la vitesse.
- SRT est le format de sous-titres le plus largement pris en charge. VTT (WebVTT) est la norme pour les lecteurs vidéo web.
- Les mises à jour de progression sont disponibles via SSE à `GET /api/v1/jobs/{jobId}/progress` jusqu'à ce que le travail soit terminé.
