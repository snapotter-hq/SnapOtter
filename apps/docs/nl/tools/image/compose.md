---
description: "Leg afbeeldingen over elkaar met positie, dekking en overvloeimodi voor compositie."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: c2e3477a5984
---

# Afbeeldingscompositie {#image-composition}

Leg een overlay-afbeelding over een basisafbeelding met configureerbare positie, dekking en overvloeimodus. Nuttig voor het samenstellen van logo's, graphics of het combineren van meerdere afbeeldingen.

## API-eindpunt {#api-endpoint}

`POST /api/v1/tools/image/compose`

Accepteert multipart-formuliergegevens met **twee** afbeeldingsbestanden en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| x | number | Nee | `0` | Horizontale offset van de overlay vanaf de linkerbovenhoek in pixels (min. 0) |
| y | number | Nee | `0` | Verticale offset van de overlay vanaf de linkerbovenhoek in pixels (min. 0) |
| opacity | number | Nee | `100` | Dekkingspercentage van de overlay (0 tot 100) |
| blendMode | string | Nee | `"over"` | Overvloeimodus voor compositie |

### Overvloeimodi {#blend-modes}

| Waarde | Beschrijving |
|-------|-------------|
| `over` | Normale overlay (standaard) |
| `multiply` | Donkerder maken door pixelwaarden te vermenigvuldigen |
| `screen` | Lichter maken door te inverteren, te vermenigvuldigen en opnieuw te inverteren |
| `overlay` | Combineert multiply en screen op basis van de helderheid van de basis |
| `darken` | Houd de donkerste pixel van elke laag |
| `lighten` | Houd de lichtste pixel van elke laag |
| `hard-light` | Sterke contrastoverlay |
| `soft-light` | Subtiele contrastoverlay |
| `difference` | Absoluut verschil tussen lagen |
| `exclusion` | Vergelijkbaar met difference maar met lager contrast |

### Bestandsvelden {#file-fields}

| Veldnaam | Vereist | Beschrijving |
|------------|----------|-------------|
| file | Ja | De basis-/achtergrondafbeelding |
| overlay | Ja | De overlay-/voorgrondafbeelding |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Met de overvloeimodus multiply:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Opmerkingen {#notes}

- Beide afbeeldingen worden gevalideerd en gedecodeerd (HEIC, RAW, PSD, SVG worden ondersteund) vóór de compositie.
- De overlay wordt geplaatst op de exacte pixelcoördinaten die zijn opgegeven met `x` en `y`. De overlay wordt niet passend gemaakt.
- Als de dekking lager is dan 100, wordt vóór het overvloeien een alfamasker op de overlay toegepast.
- De overlay kan buiten de grenzen van de basisafbeelding uitsteken (het gedeelte daarbuiten wordt afgeknipt).
- De EXIF-oriëntatie wordt automatisch toegepast op beide afbeeldingen vóór de verwerking.
- De uitvoerafmetingen komen overeen met de afmetingen van de basisafbeelding.
