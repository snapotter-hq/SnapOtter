---
description: "Skapa memes med mallar eller egna bilder, formaterade textrutor och typsnittsalternativ."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: d36bb85f66e4
---

# Meme-generator {#meme-generator}

Skapa memes med hjälp av inbyggda mallar eller egna bilder. Lägg till text med klassisk meme-stil (fet, konturerad text), flera layoutförval och typsnittsval.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Tar emot antingen:
- **Multipart-formulärdata** med en bildfil och ett JSON-fält `settings` (läge för egen bild)
- **JSON-kropp** med ett `templateId` (mall-läge, ingen filuppladdning behövs)

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| templateId | string | Nej | - | ID för inbyggd meme-mall. Om det anges behövs ingen bilduppladdning |
| textLayout | string | Nej | `"top-bottom"` | Textrutans layout: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Nej | `[]` | Array av textrutobjekt med fälten `id` och `text` |
| fontFamily | string | Nej | `"anton"` | Typsnitt: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Nej | auto | Teckenstorlek i pixlar (8 till 200). Beräknas automatiskt om den utelämnas |
| textColor | string | Nej | `"#ffffff"` | Textens fyllnadsfärg |
| strokeColor | string | Nej | `"#000000"` | Textens kontur-/konturfärg |
| textAlign | string | Nej | `"center"` | Textjustering: `left`, `center`, `right` |
| allCaps | boolean | Nej | `true` | Konvertera text till versaler |

### Textrutor {#text-boxes}

Varje post i arrayen `textBoxes` bör ha:

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| id | string | Rutidentifierare som matchar layouten (t.ex. `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Meme-texten som ska visas |

### Ruт-ID:n för textlayout {#text-layout-box-ids}

| Layout | Tillgängliga ruт-ID:n |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Exempelförfrågan {#example-request}

Egen bild med text upptill och nedtill:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Använder en inbyggd mall (JSON-kropp, ingen filuppladdning):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Anteckningar {#notes}

- Antingen `templateId` eller en uppladdad bildfil krävs. Om båda anges används mallen.
- Mallar definierar sina egna textrutepositioner; parametern `textLayout` ignoreras när mallar används.
- Text renderas som SVG med konturlinjer för det klassiska meme-utseendet.
- Teckenstorleken beräknas automatiskt för att passa textrutan om den inte anges uttryckligen.
- Tomma textrutor hoppas över (ingen rendering sker om alla rutor är tomma).
- Utdatafilnamnet inkluderar mall-ID:t när mallar används (t.ex. `meme-drake.png`).
- HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före bearbetning.
