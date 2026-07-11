---
description: "Pas een tweekleurig duotone-effect toe met aangepaste schaduw- en hooglichtkleuren."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 1afacaec4cbf
---

# Duotone {#duotone}

Pas een tweekleurig duotone-effect toe op een afbeelding. De afbeelding wordt omgezet naar grijstinten en vervolgens toegewezen aan een verloop tussen de schaduwkleur (donkere tonen) en de hooglichtkleur (heldere tonen).

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| shadow | string | Nee | `"#1e3a8a"` | Hex-kleur voor de schaduw (toegepast op donkere tonen) |
| highlight | string | Nee | `"#fbbf24"` | Hex-kleur voor het hooglicht (toegepast op heldere tonen) |
| intensity | integer | Nee | `100` | Effectintensiteit (0-100); 0 geeft het origineel terug, 100 past de volledige duotone toe |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Opmerkingen {#notes}

- Het uitvoerformaat komt overeen met het invoerformaat. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór verwerking.
- Een `intensity` lager dan 100 mengt het duotone-resultaat met de originele afbeelding, wat subtielere effecten mogelijk maakt.
- Populaire duotone-combinaties zijn onder meer marineblauw/goud, teal/koraal en paars/roze.
