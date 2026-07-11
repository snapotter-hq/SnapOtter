---
description: "Voeg fade-in- en fade-out-effecten toe aan audio."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 8773bef48ae7
---

# Fade Audio {#fade-audio}

Voeg fade-in- en fade-out-effecten toe aan het begin en einde van een audiobestand.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Nee | `1` | Fade-in-duur in seconden (0 tot 30) |
| fadeOutS | number | Nee | `1` | Fade-out-duur in seconden (0 tot 30) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- Stel een van beide waarden in op `0` om die faderichting over te slaan. Ten minste één moet groter zijn dan 0.
- De fadeduur wordt afgekapt tot de audiolengte als deze die overschrijdt.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt geschreven als M4A, en niet-ondersteunde decode-only-invoer valt terug op MP3.
