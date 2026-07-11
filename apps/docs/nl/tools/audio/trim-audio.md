---
description: "Knip een sectie uit een audiobestand door begin- en eindtijden op te geven."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 3f72effdd9e3
---

# Trim Audio {#trim-audio}

Knip een sectie uit een audiobestand door begin- en eindtijden in seconden op te geven.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Accepteert multipart-formulierdata met een audiobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| startS | number | Nee | `0` | Begintijd in seconden (minimaal 0) |
| endS | number | Ja | - | Eindtijd in seconden (moet na begin liggen) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Tijden worden opgegeven in seconden en kunnen decimalen bevatten (bijv. `10.5`).
- De waarde `endS` moet groter zijn dan `startS`.
- Als `endS` de audioduur overschrijdt, wordt het bestand tot het einde bijgesneden.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt weggeschreven als M4A, en niet-ondersteunde decodeer-alleen-invoer valt terug op MP3.
