---
description: "Genereer alle standaard favicon- en app-icoongroottes vanuit een bronafbeelding."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 2da79cc9987a
---

# Favicon-generator {#favicon-generator}

Genereer een complete set favicon- en app-icoonbestanden vanuit een bronafbeelding. Produceert alle standaardgroottes die nodig zijn voor browsers, Apple-apparaten en Android, samen met een web-manifest en een HTML-snippet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Accepteert multipart-formuliergegevens met een of meer afbeeldingsbestanden en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| background | string | Nee | - | Achtergrondkleur in hex (bijv. `"#ffffff"`). Indien ingesteld wordt het icoon op deze kleur samengevoegd. |
| padding | integer | Nee | `0` | Padding-percentage rond de icooninhoud (0 tot 40) |
| radius | integer | Nee | `0` | Percentage hoekafronding voor afgeronde iconen (0 tot 50) |
| sizes | integer[] | Nee | - | Beperk de uitvoer tot specifieke pixelgroottes (bijv. `[16, 32, 180]`). Laat weg om alle standaardgroottes te genereren. |
| themeColor | string | Nee | `"#ffffff"` | Themakleur in hex voor het web-manifest |

## Gegenereerde bestanden {#generated-files}

Voor elke invoerafbeelding worden de volgende bestanden geproduceerd:

| Bestand | Grootte | Doel |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Browsertabbladicoon |
| `favicon-32x32.png` | 32x32 | Browsertabbladicoon (HiDPI) |
| `favicon-48x48.png` | 48x48 | Bureaubladsnelkoppeling |
| `apple-touch-icon.png` | 180x180 | iOS-beginscherm |
| `android-chrome-192x192.png` | 192x192 | Android-beginscherm |
| `android-chrome-512x512.png` | 512x512 | Android-opstartscherm |
| `favicon.ico` | 32x32 | Verouderd ICO-formaat |
| `manifest.json` | - | Web-app-manifest met icoonverwijzingen |
| `favicon-snippet.html` | - | Kant-en-klare HTML link-tags |

## Voorbeeldverzoek {#example-request}

Eén bronafbeelding met afgeronde hoeken en padding:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Meerdere bronafbeeldingen (elke krijgt zijn eigen set in een submap):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Voorbeeldantwoord {#example-response}

Het antwoord is een ZIP-bestand dat rechtstreeks wordt gestreamd. De antwoordheaders zijn:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Meegeleverde HTML-snippet {#html-snippet-included}

De ZIP bevat een bestand `favicon-snippet.html` dat je in je HTML `<head>` kunt plakken:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Opmerkingen {#notes}

- Bronafbeeldingen worden vergroot/verkleind met de fit-modus `cover`, wat betekent dat ze worden bijgesneden om elke vierkante grootte te vullen. Gebruik voor het beste resultaat een vierkante bronafbeelding.
- Wanneer meerdere bestanden worden geüpload, krijgt elk zijn eigen submap in de ZIP (genoemd naar het bronbestand).
- Bij een upload van één bestand staan alle uitvoerbestanden in de hoofdmap van de ZIP zonder submap.
- Bestanden die niet slagen voor validatie of decodering worden overgeslagen, en er wordt een `skipped-files.txt` opgenomen in de ZIP die de problemen uitlegt.
- Ondersteunde invoerformaten: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD en meer.
- EXIF-oriëntatie wordt automatisch toegepast vóór het vergroten/verkleinen.
