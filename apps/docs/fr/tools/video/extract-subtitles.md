---
description: "Extrait la piste de sous-titres d'une vidéo sous forme de fichier SRT, WebVTT ou ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: d090a4dd74ba
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Extrait la piste de sous-titres intégrée d'un conteneur vidéo et la télécharge sous forme de fichier SRT, WebVTT ou ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Accepte des données de formulaire multipart avec un fichier vidéo et une chaîne JSON `settings` facultative.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Format de sortie : `srt`, `vtt` (WebVTT) ou `ass` |

La première piste de sous-titres trouvée dans le conteneur vidéo est extraite.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- La vidéo doit contenir une piste de sous-titres intégrée. Si aucune piste de sous-titres n'est trouvée, la requête renvoie une erreur 400.
- Si la vidéo comporte plusieurs pistes de sous-titres, la première est extraite.
- Les pistes texte (SubRip, ASS, mov_text, WebVTT) se convertissent dans n'importe lequel des trois formats de sortie. Convertir une piste ASS en SRT ou WebVTT supprime son positionnement et ses effets.
- Les pistes basées sur des images (Blu-ray PGS, DVD VobSub) ne peuvent pas être converties en texte sans OCR et renvoient une erreur 422.
