---
description: "Vervang een specifieke kleur in een afbeelding door een andere kleur of maak deze transparant."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 827546b47eb7
---

# Replace & Invert Color {#replace-invert-color}

Vervang pixels die overeenkomen met een bronkleur door een doelkleur, of maak ze transparant. Gebruikt de euclidische afstand in de RGB-ruimte met een instelbare tolerantie voor vloeiende overgangen bij kleurgrenzen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Accepteert multipart form data met een afbeeldingsbestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Nee | `"#FF0000"` | Te vinden hex-kleur (formaat: `#RRGGBB`) |
| targetColor | string | Nee | `"#00FF00"` | Hex-kleur om mee te vervangen (formaat: `#RRGGBB`) |
| makeTransparent | boolean | Nee | `false` | Overeenkomende pixels transparant maken in plaats van te vervangen door de doelkleur |
| tolerance | number | Nee | `30` | Tolerantie voor kleurovereenkomst (0 tot 255). Hogere waarden komen overeen met een breder bereik van vergelijkbare kleuren |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Een groene achtergrond transparant maken:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- Kleurovereenkomst gebruikt de euclidische afstand in de RGB-ruimte, geschaald door `tolerance * sqrt(3)`.
- Het mengen bij vervanging is evenredig met de kleurafstand: pixels die dichter bij de bronkleur liggen, krijgen meer van de doelkleur, wat vloeiende overgangen creëert.
- Wanneer `makeTransparent` `true` is, wordt de uitvoer geforceerd naar PNG (of WebP/AVIF) als het invoerformaat geen alfakanalen ondersteunt (bijv. JPEG).
- Een tolerantie van 0 komt alleen overeen met de exacte bronkleur. Hogere waarden (50+) komen overeen met een breder bereik van vergelijkbare tinten.
- Het uitvoerformaat komt overeen met het invoerformaat, tenzij transparantie nodig is en het invoerformaat geen alfa-ondersteuning heeft.
