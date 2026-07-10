---
description: "Multiplexe une piste de sous-titres dans le conteneur vidéo."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 7eecafb0406d
---

# Embed Subtitles {#embed-subtitles}

Multiplexe un fichier de sous-titres dans le conteneur vidéo sous forme de piste de sous-titres souple que les spectateurs peuvent activer ou désactiver.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Accepte des données de formulaire multipart avec un fichier vidéo et un fichier de sous-titres, plus un champ JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | Code de langue ISO 639-2/B (3 lettres minuscules, par exemple `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- Téléversez deux fichiers : le premier doit être une vidéo, le second doit être un fichier de sous-titres (.srt, .vtt ou .ass).
- Les sous-titres intégrés (souples) peuvent être activés par le spectateur dans son lecteur multimédia. Pour des sous-titres visibles en permanence, utilisez plutôt l'outil Burn Subtitles.
- Le code de langue est stocké sous forme de métadonnées dans le conteneur et aide les lecteurs multimédias à étiqueter la piste de sous-titres.
