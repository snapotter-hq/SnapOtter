---
description: "Extrahera dominerande färger från en bild som en färgpalett."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 5e65b17c6597
---

# Färgpalett {#color-palette}

Extrahera de dominerande färgerna från en bild och returnera dem som hex-färgvärden. Använder kvantiserad frekvensanalys för att identifiera de mest framträdande och visuellt distinkta färgerna.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Tar emot multipart-formulärdata med en bildfil och ett valfritt JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| count | integer | Nej | `8` | Antal färger att extrahera (2-16) |
| format | string | Nej | `"hex"` | Färgformat: `hex`, `rgb`, `hsl` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Exempelsvar {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Svarsfält {#response-fields}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| filename | string | Sanerat filnamn |
| colors | array | Array med färgsträngar i det begärda formatet, ordnade efter dominans (mest frekvent först) |
| hex | array | Array med hex-färgsträngar (alltid hex, oavsett inställningen `format`) |
| count | number | Antal extraherade färger |

## Anteckningar {#notes}

- Returnerar upp till `count` dominerande färger (standard 8, intervall 2-16), sorterade efter frekvens (vanligast först).
- Bilden storleksändras internt till 100x100 pixlar för analys, så paletten representerar den övergripande färgfördelningen snarare än små detaljer.
- Färger extraheras med median-cut-kvantisering, som rekursivt delar upp pixelpopulationer längs kanalen med det bredaste intervallet.
- Alfakanalen tas bort före analysen, så transparenta områden beaktas inte.
- Detta är en skrivskyddad slutpunkt. Den genererar ingen nedladdningsbar utdatafil eller `jobId`.
- Indata i HEIC, RAW, PSD och SVG avkodas automatiskt före analysen.
