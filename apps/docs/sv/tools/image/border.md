---
description: "Lägg till kanter, utfyllnad, rundade hörn och slagskuggor på bilder i en förutsägbar, kontrollerbar ordning."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 08e9a4535c5d
---

# Kant och ram {#border-frame}

Lägg till kanter, utfyllnad, rundade hörn och slagskuggor på bilder. Verktyget tillämpar effekterna i ordning: utfyllnad, kant, hörnradie och sedan skugga.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| borderWidth | tal | Nej | 10 | Kanttjocklek i pixlar (0 till 2000) |
| borderColor | sträng | Nej | `"#000000"` | Kantfärg i hex (t.ex. `#FF0000`) |
| padding | tal | Nej | 0 | Inre utfyllnad mellan bild och kant i pixlar (0 till 200) |
| paddingColor | sträng | Nej | `"#FFFFFF"` | Fyllnadsfärg för utfyllnad i hex |
| cornerRadius | tal | Nej | 0 | Hörnradie i pixlar (0 till 2000) |
| shadow | boolean | Nej | `false` | Om en slagskugga ska läggas till |
| shadowBlur | tal | Nej | 15 | Radie för skuggoskärpa (1 till 200) |
| shadowOffsetX | tal | Nej | 0 | Horisontell skuggförskjutning (-50 till 50) |
| shadowOffsetY | tal | Nej | 5 | Vertikal skuggförskjutning (-50 till 50) |
| shadowColor | sträng | Nej | `"#000000"` | Skuggfärg i hex |
| shadowOpacity | tal | Nej | 40 | Skuggopacitet i procent (0 till 100) |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Anteckningar {#notes}

- Använder standardfabriken `createToolRoute`. Tar emot en enda bildfil via multipart-uppladdning.
- Stöder indataformaten HEIC, RAW, PSD och SVG (avkodas automatiskt).
- Bearbetningsordning: utfyllnad läggs till först, sedan lindas kanten runt, därefter tillämpas hörnradien och slutligen komponeras skuggan in.
- När `cornerRadius` eller `shadow` är aktiverat tvingas utdata till PNG (oavsett indataformat) för att bevara transparens. Format som stöder alfa (PNG, WebP, AVIF) behåller sitt ursprungliga format.
- Skuggan är formmedveten: den följer de rundade hörnen i stället för att skapa en rektangulär skugga.
- Att sätta `borderWidth` till 0 och bara använda `cornerRadius` + `shadow` skapar en ramlös rundad skuggeffekt.
