---
description: "Converteer ondertitelbestanden tussen SRT, WebVTT en ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 7cc94a766d18
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

Converteer een ondertitelbestand tussen SRT, WebVTT en ASS. Timing en tekst blijven behouden; ASS-positionering en -effecten niet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Accepteert multipart form data met één ondertitelbestand (`.srt`, `.vtt` of `.ass`) en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Uitvoerformaat: `srt`, `vtt` of `ass` |
| `encoding` | string | `"auto"` | Tekencodering van de invoer: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` of `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- Bij het converteren vanuit ASS blijven de timing, de dialoogtekst en de basisopmaak behouden die het doelformaat kan bevatten: SRT behoudt cursief, vet, kleur en lettergrootte als tags, WebVTT behoudt cursief, vet en onderstreept. Positionering op het scherm, animaties en andere ASS-effecten vervallen.
- De uitvoer is altijd UTF-8. Als `encoding` op `auto` staat, wordt een bestand dat geldig UTF-8 is zoals het is gelezen en wordt al het andere gelezen als Windows-1252, de gebruikelijke codering voor oudere West-Europese SRT-bestanden. Als letters met accenten of niet-Latijnse tekens onleesbaar uitkomen, stel `encoding` dan in op de werkelijke codering van het bestand (bijvoorbeeld `gb18030` voor vereenvoudigd Chinees of `windows-1251` voor Cyrillisch).
- Ondertitel-uploads zijn standaard beperkt tot 1 MB. Verhoog of verwijder de limiet met `MAX_SUBTITLE_SIZE_MB`.
