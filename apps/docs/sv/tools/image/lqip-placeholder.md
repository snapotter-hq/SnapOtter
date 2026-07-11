---
description: "Generera en pytteliten lågkvalitativ bildplatshållare med base64-data-URI."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: b6ff4f324029
---

# LQIP-platshållare {#lqip-placeholder}

Generera en pytteliten lågkvalitativ bildplatshållare (LQIP) från en källbild. Returnerar en liten platshållarfil tillsammans med en base64-data-URI, en färdig HTML-`<img>`-tagg och ett CSS-`background-image`-utdrag för omedelbar inbäddning.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| width | integer | Nej | `16` | Målbredd i pixlar (4-64) |
| blur | number | Nej | `2` | Suddighetsradie för suddighetsstrategin (0-20) |
| strategy | string | Nej | `"blur"` | Platshållarstrategi: `blur`, `pixelate` eller `solid` |
| format | string | Nej | `"webp"` | Utdataformat: `webp`, `png` eller `jpeg` |
| quality | integer | Nej | `50` | Utdatakvalitet (1-100) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Exempelsvar {#example-response}

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

## Anmärkningar {#notes}

- Fältet `dataUri` innehåller den kompletta data-URI:n, redo att användas i `src`-attribut eller CSS utan ytterligare begäranden.
- Fälten `html` och `css` tillhandahåller utdrag att kopiera och klistra in för vanliga användningsfall.
- Strategin `blur` producerar en mjuk, suddig miniatyr. Strategin `pixelate` skapar en blockig mosaik. Strategin `solid` returnerar en enda medelfärg.
- Typiska platshållarstorlekar är 200-500 byte, vilket gör dem lämpliga för inlining direkt i HTML.
- Höjden beräknas automatiskt för att bevara källbildens bildförhållande.
- HEIC-, RAW-, PSD- och SVG-inmatningar avkodas automatiskt före bearbetning.
