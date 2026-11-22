---
description: "Wijzig tekst naar HOOFDLETTERS, kleine letters, Titel, Zinsopbouw en meer."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 1a435e575f06
i18n_hash_version: 2
---

# Hoofdlettergebruik converteren {#convert-case}

Plak tekst, kies een hoofdlettergebruik en kopieer het resultaat. De tekst gaat naar je eigen SnapOtter-server en nergens anders heen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Accepteert een JSON-body, geen multipart form data, en antwoordt met de geconverteerde tekst in plaats van een bestand om te downloaden.

## Parameters {#parameters}

| Naam | Type | Standaard | Beschrijving |
|------|------|---------|-------------|
| `text` | string | (vereist) | Tekst om te converteren. Maximaal 1.000.000 tekens. |
| `mode` | string | (vereist) | Een van de onderstaande modi. |
| `locale` | string | (geen) | BCP 47-taaltag, zoals `tr` of `de`, voor letters waarvan het hoofdlettergebruik van de taal afhangt. Zonder deze tag is het hoofdlettergebruik voor elke taal hetzelfde. |

| Modus | Invoer | Uitvoer |
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

- `title` laat korte Engelse woorden (a, an, and, of, the, to en dergelijke) in kleine letters, tenzij ze het begin of het einde van de regel vormen. `capitalized` maakt van elk woord een hoofdletterwoord.
- `sentence` begint een nieuwe zin aan het begin van de tekst, na een regeleinde en na `.`, `!`, `?` of `…` gevolgd door een spatie, dus de punt in `snapotter.com` of `3.5` telt niet mee.
- `camel`, `pascal`, `snake` en `kebab` splitsen op spaties, leestekens en bestaande wijzigingen in hoofdlettergebruik (`XMLHttpRequest` wordt `xml_http_request`) en converteren elke regel afzonderlijk.
- Met `locale` ingesteld op `tr` wordt `i` in hoofdletters `İ` en wordt `I` in kleine letters `ı`. Het Duitse `ß` wordt in elke taalregio in hoofdletters `SS`.
- De webapp stuurt de huidige interfacetaal mee als `locale`.
