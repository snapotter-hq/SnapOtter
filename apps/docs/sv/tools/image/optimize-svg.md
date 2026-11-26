---
description: "Minifiera SVG-filer med svgo och behåll resultatet som vektor-SVG, med kontroller för precision, flera pass, metadata och formatering."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 6f73f0926a04
i18n_hash_version: 2
---

# Optimera SVG {#optimize-svg}

Gör SVG-filer mindre genom att ta bort rester från redigeringsprogram, överflödiga attribut och onödiga decimaler, och ladda ner resultatet som SVG. Till skillnad från ”Optimera för webben” rastreras utdata aldrig.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Tar emot multipart-formulärdata med en `.svg`- eller `.svgz`-fil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| precision | number | Nej | `3` | Antal decimaler som behålls i banddata och tal (0 till 8). Lägre värden ger mindre filer och något grövre kurvor. |
| multipass | boolean | Nej | `true` | Kör optimeraren upprepade gånger tills utdata slutar bli mindre |
| removeMetadata | boolean | Nej | `true` | Ta bort kommentarer, `<metadata>`, `<desc>` och redigeringsspecifik data. Stäng av för att behålla dem. |
| pretty | boolean | Nej | `false` | Dra in utdata för läsbarhet i stället för att minifiera det till få rader |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Anteckningar {#notes}

- Indata måste vara en SVG- eller SVGZ-fil. En rasterbild avvisas med `400` och koden `IMAGE_UNDECODABLE`.
- `.svgz`-indata packas upp först, och utdata är alltid en vanlig `.svg`.
- SVG-filen är begränsad till 10 MB efter uppackning. En större fil avvisas med `400` och koden `SVG_TOO_LARGE`.
- `viewBox` och `<title>` behålls alltid, så att grafiken fortfarande skalas och behåller sitt tillgängliga namn.
- Både indata och utdata passerar SVG-saneraren, som tar bort skript och annat aktivt innehåll.
- Att sänka `precision` sparar mest utrymme för banintensiv grafik. Kontrollera resultatet visuellt vid 0 till 2.
