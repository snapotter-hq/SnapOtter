---
description: "Muxa ett undertextspår in i videocontainern."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: b8292b149752
---

# Bädda in undertexter {#embed-subtitles}

Muxa en undertextfil in i videocontainern som ett mjukt undertextspår som tittarna kan slå av och på.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Tar emot multipart-formulärdata med en videofil och en undertextfil, plus ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| language | string | Nej | `"eng"` | Språkkod enligt ISO 639-2/B (3 gemena bokstäver, t.ex. `"eng"`, `"fra"`, `"deu"`) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Anteckningar {#notes}

- Ladda upp två filer: den första måste vara en video, den andra måste vara en undertextfil (.srt, .vtt eller .ass).
- Inbäddade (mjuka) undertexter kan slås av och på av tittaren i deras mediaspelare. För permanent synliga undertexter, använd verktyget Bränn in undertexter i stället.
- Språkkoden lagras som metadata i containern och hjälper mediaspelare att märka undertextspåret.
