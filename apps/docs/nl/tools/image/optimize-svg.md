---
description: "Minimaliseer SVG-bestanden met svgo en bewaar het resultaat als vector-SVG, met instellingen voor precisie, meerdere doorgangen, metadata en opmaak."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 6eeb8eda7e87
i18n_hash_version: 2
---

# SVG optimaliseren {#optimize-svg}

Maak SVG-bestanden kleiner door editorresten, overbodige attributen en te veel decimalen te verwijderen, en download het resultaat als SVG. Anders dan bij “Optimaliseren voor web” wordt de uitvoer nooit gerasterd.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Accepteert multipart-formuliergegevens met een `.svg`- of `.svgz`-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| precision | number | Nee | `3` | Aantal decimalen dat behouden blijft in padgegevens en getallen (0 tot 8). Lagere waarden geven kleinere bestanden en iets grovere bochten. |
| multipass | boolean | Nee | `true` | De optimalisatie herhaaldelijk uitvoeren tot de uitvoer niet meer kleiner wordt |
| removeMetadata | boolean | Nee | `true` | Opmerkingen, `<metadata>`, `<desc>` en editorspecifieke gegevens verwijderen. Zet dit uit om ze te behouden. |
| pretty | boolean | Nee | `false` | De uitvoer inspringen voor leesbaarheid in plaats van over weinig regels te minimaliseren |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- De invoer moet een SVG- of SVGZ-bestand zijn. Een rasterafbeelding wordt geweigerd met `400` en de code `IMAGE_UNDECODABLE`.
- `.svgz`-invoer wordt eerst uitgepakt, en de uitvoer is altijd een gewone `.svg`.
- De SVG is na het uitpakken beperkt tot 10 MB. Een groter bestand wordt geweigerd met `400` en de code `SVG_TOO_LARGE`.
- `viewBox` en `<title>` blijven altijd behouden, zodat de afbeelding blijft schalen en haar toegankelijke naam houdt.
- Invoer en uitvoer gaan beide door de SVG-sanitizer, die scripts en andere actieve inhoud verwijdert.
- Een lagere `precision` bespaart het meeste ruimte bij padzware afbeeldingen. Controleer het resultaat visueel bij 0 tot 2.
