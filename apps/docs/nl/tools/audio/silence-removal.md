---
description: "Verwijder stille secties uit een audiobestand."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 3dcf7034debd
---

# Silence Removal {#silence-removal}

Detecteer en verwijder stille secties uit een audiobestand op basis van een instelbare drempelwaarde en minimale duur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Accepteert multipart-formulierdata met een audiobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | Nee | `-50` | Stiltedrempel in dB (-80 tot -20). Audio onder dit niveau wordt als stil beschouwd. |
| minSilenceS | number | Nee | `0.5` | Minimale stilteduur in seconden om te verwijderen (0.1 tot 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Een hogere (minder negatieve) drempel is agressiever en verwijdert ook stillere passages naast echte stilte.
- Verhoog `minSilenceS` om alleen langere pauzes weg te knippen en korte natuurlijke pauzes te behouden.
- Handig voor het opschonen van podcastopnames, colleges en spraakmemo's.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt weggeschreven als M4A, en niet-ondersteunde decodeer-alleen-invoer valt terug op MP3.
