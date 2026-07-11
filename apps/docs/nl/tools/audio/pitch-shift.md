---
description: "Verhoog of verlaag de audiotoonhoogte met halve tonen zonder de snelheid te wijzigen."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 277ec3d3c809
---

# Pitch Shift {#pitch-shift}

Verhoog of verlaag de toonhoogte van een audiobestand met een aantal halve tonen zonder de afspeelsnelheid te wijzigen.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| semitones | integer | Nee | `3` | Halve tonen om te verschuiven (-12 tot 12). Moet niet nul zijn. |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Opmerkingen {#notes}

- Positieve waarden verhogen de toonhoogte; negatieve waarden verlagen die.
- Een verschuiving van 12 halve tonen is gelijk aan één octaaf omhoog; -12 is gelijk aan één octaaf omlaag.
- De afspeelduur blijft hetzelfde, ongeacht de mate van verschuiving.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt geschreven als M4A, en niet-ondersteunde decode-only-invoer valt terug op MP3.
