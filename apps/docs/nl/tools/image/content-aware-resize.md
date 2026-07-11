---
description: "Formaatwijziging met seam carving die pixels toevoegt of verwijdert langs paden van laag belang om belangrijke inhoud en gezichten te behouden."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 30825642af92
---

# Inhoudsbewuste formaatwijziging {#content-aware-resize}

Formaatwijziging met seam carving die op intelligente wijze pixels verwijdert of toevoegt langs paden met het minste visuele belang, waarbij belangrijke inhoud behouden blijft en gezichten optioneel worden beschermd.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Verwerking:** Synchroon (geeft het resultaat direct terug)

**Modelbundel:** Geen vereist voor de basisbewerking. Gezichtsbescherming gebruikt de bundel `face-detection` (200-300 MB) indien ingeschakeld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| width | number | Nee | - | Doelbreedte in pixels |
| height | number | Nee | - | Doelhoogte in pixels |
| protectFaces | boolean | Nee | `false` | Detecteer en bescherm gezichten tegen seam-verwijdering |
| blurRadius | number | Nee | `4` | Voorverwerkings-vervagingsstraal voor de energieberekening (0-20) |
| sobelThreshold | number | Nee | `2` | Drempelwaarde voor Sobel-randdetectie (1-20). Hogere waarden maken het algoritme agressiever |
| square | boolean | Nee | `false` | Wijzig het formaat naar een vierkant (gebruikt de kleinste dimensie) |

Er moet ten minste een van `width`, `height` of `square` worden opgegeven.

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Antwoord (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Opmerkingen {#notes}

- Deze aangepaste route geeft momenteel een synchroon 200-antwoord terug.
- Gebruikt de seam-carving-bibliotheek `caire` voor inhoudsbewuste formaatwijziging.
- Verkleint alleen afmetingen (verwijdert seams). Kan een afbeelding niet vergroten boven de oorspronkelijke grootte.
- De optie `protectFaces` gebruikt AI-gezichtsdetectie om gezichtsgebieden als hoog-energetisch te markeren, zodat er geen seams door gezichten lopen.
- `blurRadius` regelt de gladstrijking vóór de berekening van de energiekaart. Hogere waarden maken de energiekaart uniformer, wat kan helpen bij ruisrijke afbeeldingen.
- `sobelThreshold` bepaalt hoe agressief randen worden gedetecteerd. Lagere waarden behouden meer subtiele randen.
- De uitvoer is altijd in PNG-formaat.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
