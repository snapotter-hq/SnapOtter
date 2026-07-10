---
description: "Fyll ut en bild till ett målbildförhållande med en enfärgad, transparent eller suddig bakgrund."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 8279f6f8c940
---

# Bildutfyllnad {#image-pad}

Fyll ut en bild till ett målbildförhållande genom att lägga till en enfärgad, transparent eller suddig bakgrund runt den. Användbart för att passa in bilder i fasta bildförhållanden för sociala medier eller tryck utan beskärning.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| target | string | Nej | `"1:1"` | Målbildförhållande: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` eller `custom` |
| ratioW | integer | Nej | `1` | Anpassad förhållandebredd (1-100, används när target är `custom`) |
| ratioH | integer | Nej | `1` | Anpassad förhållandehöjd (1-100, används när target är `custom`) |
| background | string | Nej | `"color"` | Bakgrundsläge: `color`, `transparent` eller `blur` |
| color | string | Nej | `"#ffffff"` | Bakgrundens hexfärg (när background är `color`) |
| padding | integer | Nej | `0` | Extra utfyllnad som procent av arbetsytan (0-50) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Anmärkningar {#notes}

- Bakgrundsläget `blur` skapar en suddig kopia av originalbilden som utfyllnadsfyllning, vilket ger ett visuellt sammanhängande resultat.
- Vid användning av bakgrunden `transparent` konverteras utdata till PNG för att bevara alfa.
- Utdataformatet matchar inmatningsformatet om inte transparens är inblandad. HEIC-, RAW-, PSD- och SVG-inmatningar avkodas automatiskt före bearbetning.
- Ange `target` till `custom` och tillhandahåll `ratioW` och `ratioH` för godtyckliga bildförhållanden (t.ex. `ratioW: 3, ratioH: 2` för 3:2).
