---
description: "Haal het ondertitelspoor uit een video als SRT-, WebVTT- of ASS-bestand."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 7c4c5738bb09
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Haal het ingebedde ondertitelspoor uit een videocontainer en download het als een SRT-, WebVTT- of ASS-bestand.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Accepteert multipart form data met een videobestand en een optionele `settings` JSON-string.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Uitvoerformaat: `srt`, `vtt` (WebVTT) of `ass` |

Het eerste ondertitelspoor dat in de videocontainer wordt gevonden, wordt eruit gehaald.

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

- De video moet een ingebed ondertitelspoor bevatten. Als er geen ondertitelspoor wordt gevonden, geeft het verzoek een 400-fout terug.
- Als de video meerdere ondertitelsporen heeft, wordt het eerste eruit gehaald.
- Tekstsporen (SubRip, ASS, mov_text, WebVTT) zijn om te zetten naar elk van de drie uitvoerformaten. Bij het omzetten van een ASS-spoor naar SRT of WebVTT gaan de positionering en effecten verloren.
- Op afbeeldingen gebaseerde sporen (Blu-ray PGS, DVD VobSub) zijn zonder OCR niet om te zetten naar tekst en geven een 422-fout terug.
