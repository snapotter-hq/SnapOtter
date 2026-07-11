---
description: "Verminder achtergrondruis van audio met FFT-gebaseerde ruisonderdrukking."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: c21f33d3c98f
---

# Noise Reduction {#noise-reduction}

Verminder achtergrondruis in een audiobestand met FFT-gebaseerde ruisonderdrukking met instelbare sterkte.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| strength | string | Nee | `"medium"` | Sterkte van ruisonderdrukking: `light`, `medium`, `strong` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` behoudt meer detail maar verwijdert minder ruis. `strong` verwijdert meer ruis maar kan subtiele artefacten introduceren.
- Beste resultaten bij opnamen met consistente achtergrondruis (ventilatorgebrom, airconditioning, statische ruis).
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt geschreven als M4A, en niet-ondersteunde decode-only-invoer valt terug op MP3.
