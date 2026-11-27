---
description: "Ändra text till VERSALER, gemener, Titel, Mening och mer."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: b1ce1e6b3769
i18n_hash_version: 2
---

# Ändra skiftläge {#convert-case}

Klistra in text, välj ett skiftläge och kopiera resultatet. Texten skickas till din egen SnapOtter-server och ingen annanstans.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Tar emot en JSON-kropp, inte multipart-formulärdata, och svarar med den konverterade texten i stället för en fil att ladda ner.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (obligatorisk) | Text att konvertera. Upp till 1 000 000 tecken. |
| `mode` | string | (obligatorisk) | Ett av lägena nedan. |
| `locale` | string | (ingen) | BCP 47-språkkod, till exempel `tr` eller `de`, för bokstäver vars skiftläge beror på språket. Utan den blir skiftläget detsamma för alla språk. |

| Läge | Indata | Utdata |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` behåller korta engelska ord (a, an, and, of, the, to och liknande) med gemener om de inte står först eller sist på raden. `capitalized` skriver varje ord med versal inledande bokstav.
- `sentence` inleder en ny mening i början av texten, efter en radbrytning och efter `.`, `!`, `?` eller `…` följt av ett blanksteg, så punkten i `snapotter.com` eller `3.5` räknas inte.
- `camel`, `pascal`, `snake` och `kebab` delar upp vid blanksteg, skiljetecken och befintliga skiftlägesbyten (`XMLHttpRequest` blir `xml_http_request`) och konverterar varje rad för sig.
- Med `locale` satt till `tr` blir `i` med versaler `İ` och `I` med gemener `ı`. Tyskans `ß` blir `SS` med versaler i alla språkinställningar.
- Webbappen skickar sitt aktuella gränssnittsspråk som `locale`.
