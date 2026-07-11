---
description: "Genereer een kleine low-quality afbeeldingsplaceholder met base64 data-URI."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: b04cea872353
---

# LQIP-placeholder {#lqip-placeholder}

Genereer een kleine low-quality afbeeldingsplaceholder (LQIP) vanuit een bronafbeelding. Retourneert een klein placeholderbestand samen met een base64 data-URI, een kant-en-klare HTML `<img>`-tag en een CSS `background-image`-snippet voor directe inbedding.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| width | integer | Nee | `16` | Doelbreedte in pixels (4-64) |
| blur | number | Nee | `2` | Vervagingsradius voor de vervagingsstrategie (0-20) |
| strategy | string | Nee | `"blur"` | Placeholderstrategie: `blur`, `pixelate` of `solid` |
| format | string | Nee | `"webp"` | Uitvoerformaat: `webp`, `png` of `jpeg` |
| quality | integer | Nee | `50` | Uitvoerkwaliteit (1-100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Opmerkingen {#notes}

- Het veld `dataUri` bevat de volledige data-URI, klaar voor gebruik in `src`-attributen of CSS zonder aanvullende verzoeken.
- De velden `html` en `css` bieden kopieer-en-plak-snippets voor veelvoorkomende gebruiksscenario's.
- De strategie `blur` produceert een zachte, vervaagde thumbnail. De strategie `pixelate` maakt een blokkerig mozaïek. De strategie `solid` retourneert één enkele gemiddelde kleur.
- Typische placeholdergroottes zijn 200-500 bytes, waardoor ze geschikt zijn om rechtstreeks in HTML in te voegen.
- De hoogte wordt automatisch berekend om de beeldverhouding van de bronafbeelding te behouden.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de verwerking.
