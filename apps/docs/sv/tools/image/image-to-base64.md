---
description: "Konvertera bilder till base64-data-URI:er för inbäddning i HTML, CSS med mera."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: c882fdccdd4b
---

# Bild till Base64 {#image-to-base64}

Konvertera en eller flera bilder till base64-kodade strängar och data-URI:er. Stöder valfri formatkonvertering, kvalitetskontroll och storleksändring. Användbart för att bädda in bilder direkt i HTML, CSS, JSON eller e-postmallar.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Tar emot multipart-formulärdata med en eller flera bildfiler och ett valfritt JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Nej | `"original"` | Konvertera före kodning: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Nej | `80` | Utdatakvalitet för förlustbehäftade format (1 till 100) |
| maxWidth | number | Nej | `0` | Maximal bredd i pixlar (0 = ingen storleksändring, förstoras inte) |
| maxHeight | number | Nej | `0` | Maximal höjd i pixlar (0 = ingen storleksändring, förstoras inte) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Flera filer:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Exempelsvar {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Svarsfält {#response-fields}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| results | array | Bilder som konverterats framgångsrikt |
| errors | array | Bilder som misslyckades med bearbetning (med filnamn och felmeddelande) |

### Resultatobjekt {#result-object}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| filename | string | Ursprungligt filnamn |
| mimeType | string | MIME-typ för den kodade utdatan |
| width | number | Slutlig bredd i pixlar (efter eventuell storleksändring) |
| height | number | Slutlig höjd i pixlar (efter eventuell storleksändring) |
| originalSize | number | Ursprunglig filstorlek i byte |
| encodedSize | number | Storlek på base64-strängen i byte |
| overheadPercent | number | Procentuell storleksskillnad jämfört med originalet (positiv = större, negativ = mindre) |
| base64 | string | Rå base64-kodad bilddata |
| dataUri | string | Komplett data-URI redo att användas i `src`-attribut |

## Anmärkningar {#notes}

- Base64-kodning ökar vanligtvis storleken med cirka 33% jämfört med binärfilen. Fältet `overheadPercent` visar den faktiska skillnaden.
- När `outputFormat` är `"original"` konverteras HEIC/HEIF-filer till JPEG (eftersom webbläsare inte kan visa HEIC i data-URI:er).
- Alternativen `maxWidth` och `maxHeight` storleksändrar med `fit: inside` och `withoutEnlargement`, så bilder som är mindre än de angivna dimensionerna förstoras inte.
- Flera filer kan bearbetas i en enda begäran. Varje fil bearbetas oberoende, och misslyckanden hindrar inte andra filer från att lyckas.
- SVG-filer skickas vidare som `image/svg+xml` utan omkodning (om inte en formatkonvertering begärs).
- Detta är en skrivskyddad slutpunkt. Den producerar ingen nedladdningsbar fil eller `jobId`. Base64-datan returneras direkt i svarskroppen.
