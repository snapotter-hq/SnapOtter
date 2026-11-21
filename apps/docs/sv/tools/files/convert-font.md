---
description: "Konvertera typsnitt mellan TTF, OTF, WOFF och WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 4dabd862b628
i18n_hash_version: 2
---

# Konvertera typsnitt {#convert-font}

Konverterar en typsnittsfil mellan TrueType (TTF), OpenType CFF (OTF), WOFF och WOFF2. Använd det för att göra ett skrivbordstypsnitt till ett webbtypsnitt, eller för att få en TTF ur en OTF till en app som bara tar emot TrueType.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Tar emot multipart-formulärdata med en `.ttf`-, `.otf`-, `.woff`- eller `.woff2`-fil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `ttf` | Utdataformat: `ttf`, `otf`, `woff` eller `woff2` |

## Exempelförfrågan {#example-request}

OTF till TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF till WOFF2 för webben:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Anteckningar {#notes}

- WOFF och WOFF2 är komprimerade omslag runt samma typsnittsdata, så konvertering till eller från dem lämnar konturerna oförändrade.
- OTF till TTF gör om kubiska (CFF) kurvor till kvadratiska TrueType-kurvor. Varje kurva håller sig inom 1 typsnittsenhet från originalet, vilket inte syns i normala storlekar, men konverteringen går inte att vända exakt. TTF till OTF behåller kurvornas form och avrundar bara kontrollpunkter till hela typsnittsenheter.
- Typsnittets inbäddningsbehörigheter (OS/2-fältet `fsType`) behålls som de är.
- Typsnittssamlingar (`.ttc`) stöds inte. Variabla TrueType-typsnitt kan inte konverteras till OTF och variabla CFF2-typsnitt kan inte konverteras till TTF; konvertera dem till WOFF eller WOFF2 i stället.
- Konverteringen körs i Pythons dokumentworker med samma tidsgräns som de andra dokumentverktygen, inte i API-processen.
