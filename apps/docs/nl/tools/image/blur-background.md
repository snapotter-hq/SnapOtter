---
description: "Vervaag de achtergrond terwijl het onderwerp scherp blijft met behulp van AI."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 86b84cd07f28
---

# Achtergrond vervagen {#blur-background}

Vervaag de achtergrond van een afbeelding terwijl het onderwerp scherp blijft. Het AI-model isoleert het onderwerp, past een vervaging toe op de originele achtergrond en plaatst het scherpe onderwerp erbovenop.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Accepteert multipart form data met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| intensity | integer | Nee | `50` | Vervagingsintensiteit (1-100) |
| feather | integer | Nee | `0` | Straal voor het verzachten van randen (0-20) |
| format | string | Nee | `"png"` | Uitvoerformaat: `png` of `webp` |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
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
- Hogere intensiteitswaarden produceren een sterker vervagingseffect. Waarden boven 80 creëren een uitgesproken bokeh-achtige scheiding.
- HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de verwerking.
