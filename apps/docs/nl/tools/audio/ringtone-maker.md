---
description: "Maak een beltoonclip van elk audiobestand."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 713777991508
---

# Ringtone Maker {#ringtone-maker}

Maak een beltoonclip (.m4r) van elk audiobestand door een starttijd en duur te selecteren.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| startS | number | Nee | `0` | Starttijd in seconden (minimum 0) |
| durationS | number | Nee | `30` | Clipduur in seconden (1 tot 30) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Opmerkingen {#notes}

- De uitvoer is altijd M4R-formaat, compatibel met iPhone-beltonen.
- De maximale beltoonduur is 30 seconden (Apple-limiet).
- Elk audioformaat kan als invoer worden gebruikt.
