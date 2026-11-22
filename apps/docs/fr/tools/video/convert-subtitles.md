---
description: "Convertit des fichiers de sous-titres entre SRT, WebVTT et ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 929bb543d6ca
i18n_hash_version: 2
---

# Convertir des sous-titres {#convert-subtitles}

Convertit un fichier de sous-titres entre SRT, WebVTT et ASS. Le minutage et le texte sont conservés, mais pas le positionnement ni les effets ASS.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Accepte des données de formulaire multipart avec un fichier de sous-titres (`.srt`, `.vtt` ou `.ass`) et un champ JSON `settings` facultatif.

## Paramètres {#parameters}

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Format de sortie : `srt`, `vtt` ou `ass` |
| `encoding` | string | `"auto"` | Encodage du texte en entrée : `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` ou `euc-kr` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Remarques {#notes}

- La conversion depuis ASS conserve le minutage, le texte des dialogues et la mise en forme de base que le format cible peut contenir : SRT garde l'italique, le gras, la couleur et la taille de police sous forme de balises, WebVTT garde l'italique, le gras et le soulignement. Le positionnement à l'écran, les animations et les autres effets ASS sont abandonnés.
- La sortie est toujours en UTF-8. Avec `encoding` réglé sur `auto`, un fichier UTF-8 valide est lu tel quel et tout le reste est lu comme du Windows-1252, l'encodage habituel des anciens fichiers SRT d'Europe occidentale. Si des caractères accentués ou non latins apparaissent déformés, réglez `encoding` sur l'encodage réel du fichier (par exemple `gb18030` pour le chinois simplifié ou `windows-1251` pour le cyrillique).
- Les fichiers de sous-titres envoyés sont limités à 1 Mo par défaut. Relevez ou supprimez cette limite avec `MAX_SUBTITLE_SIZE_MB`.
