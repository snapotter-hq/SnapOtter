---
description: "Räkna ut den bredd eller höjd som saknas för att behålla bildförhållandet, och förenkla förhållandet."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: d43b3e9d0711
i18n_hash_version: 2
---

# Bildförhållanderäknare {#aspect-ratio-calculator}

Ange en ursprunglig bredd och höjd, sedan en ny bredd eller en ny höjd, så får du tillbaka den andra sidan så att proportionerna bevaras. Förhållandet returneras i sin enklaste form, så 1920 × 1080 blir 16:9. I webbappen kan du utgå från ett vanligt förhållande (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) och växla mellan liggande och stående.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Tar emot en JSON-kropp (inte multipart) och svarar med siffror i stället för en fil att ladda ner.

## Parametrar {#parameters}

| Namn | Typ | Standard | Beskrivning |
|------|------|---------|-------------|
| `width` | number | (obligatorisk) | Ursprunglig bredd. |
| `height` | number | (obligatorisk) | Ursprunglig höjd. |
| `newWidth` | number | - | Målbredd. Svaret räknar ut `newHeight` utifrån den. |
| `newHeight` | number | - | Målhöjd. Svaret räknar ut `newWidth` utifrån den. |
| `round` | boolean | `true` | Avrunda den beräknade sidan till ett heltal. När `false` behålls två decimaler. |

Varje mått måste ligga mellan `0.0001` och `1000000`. Skicka `newWidth` eller `newHeight`, inte båda. Utelämna båda för att bara få det förenklade förhållandet.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Exempelsvar {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` och `newHeight` är `null` när förfrågan inte innehöll någon av dem.

## Anteckningar {#notes}

- Decimalmått reduceras till ett förhållande med heltal med upp till fyra decimaler, så `8.5` × `11` returneras som `17:22`.
- `ratioDecimal` är bredden delad med höjden, avrundad till fyra decimaler.
- En beräknad sida returneras aldrig som `0`. Med avrundning på är den minst `1`, och med avrundning av är den minst `0.01`.
- Om både `newWidth` och `newHeight` skickas, eller ett mått utanför det tillåtna intervallet, returneras ett 400-fel.
- Räknaren läser eller skriver aldrig någon fil. Använd [Ändra bildstorlek](/sv/tools/image/resize) eller [Beskär bild](/sv/tools/image/crop) för att tillämpa siffrorna.
