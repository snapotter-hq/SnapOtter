---
description: "Vervang de achtergrond van een afbeelding door een effen kleur of verloop met behulp van AI."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: f9b03df0551e
---

# Achtergrond vervangen {#background-replace}

Vervang de achtergrond van een afbeelding door een effen kleur of verloop. Het AI-model detecteert het onderwerp, verwijdert de originele achtergrond en plaatst het onderwerp op de door jou gekozen achtergrond.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Nee | `"color"` | Achtergrondmodus: `color` of `gradient` |
| color | string | Nee | `"#ffffff"` | Hex-kleur van de achtergrond (wanneer backgroundType `color` is) |
| gradientColor1 | string | Nee | - | Eerste hex-kleur van het verloop |
| gradientColor2 | string | Nee | - | Tweede hex-kleur van het verloop |
| gradientAngle | integer | Nee | `180` | Verloophoek in graden (0-360) |
| feather | integer | Nee | `0` | Straal voor het verzachten van randen (0-20) |
| format | string | Nee | `"png"` | Uitvoerformaat: `png` of `webp` |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Volg de voortgang via SSE op `GET /api/v1/jobs/{jobId}/progress`. Wanneer de taak is voltooid, zendt de SSE-stream een `completed`-gebeurtenis uit met de download-URL.

## Opmerkingen {#notes}

- Dit is een AI-gestuurde tool die `202 Accepted` retourneert en asynchroon verwerkt. Maak verbinding met het SSE-endpoint om voortgangsupdates en het eindresultaat te ontvangen.
- Vereist dat de feature-bundel **background-removal** is geïnstalleerd. Retourneert `501` als de bundel niet beschikbaar is.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de verwerking.
- De uitvoer is standaard PNG om de transparantie rond het onderwerp te behouden.
