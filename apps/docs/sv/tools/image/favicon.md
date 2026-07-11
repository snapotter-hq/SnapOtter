---
description: "Generera alla standardstorlekar för favicon och appikoner från en källbild."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 7efc1f374c1c
---

# Favicon-generator {#favicon-generator}

Generera en komplett uppsättning favicon- och appikonfiler från en källbild. Producerar alla standardstorlekar som behövs för webbläsare, Apple-enheter och Android, tillsammans med ett webbmanifest och ett HTML-utdrag.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Tar emot multipart-formulärdata med en eller flera bildfiler och ett valfritt JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| background | string | Nej | - | Bakgrundens hexfärg (t.ex. `"#ffffff"`). När den anges plattas ikonen ut mot denna färg. |
| padding | integer | Nej | `0` | Utfyllnadsprocent runt ikoninnehållet (0 till 40) |
| radius | integer | Nej | `0` | Hörnradieprocent för rundade ikoner (0 till 50) |
| sizes | integer[] | Nej | - | Begränsa utdata till specifika pixelstorlekar (t.ex. `[16, 32, 180]`). Utelämna för att generera alla standardstorlekar. |
| themeColor | string | Nej | `"#ffffff"` | Temafärg i hex för webbmanifestet |

## Genererade filer {#generated-files}

För varje inmatad bild produceras följande filer:

| Fil | Storlek | Syfte |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Ikon för webbläsarflik |
| `favicon-32x32.png` | 32x32 | Ikon för webbläsarflik (HiDPI) |
| `favicon-48x48.png` | 48x48 | Skrivbordsgenväg |
| `apple-touch-icon.png` | 180x180 | iOS-hemskärm |
| `android-chrome-192x192.png` | 192x192 | Android-hemskärm |
| `android-chrome-512x512.png` | 512x512 | Android-startskärm |
| `favicon.ico` | 32x32 | Äldre ICO-format |
| `manifest.json` | - | Webbappsmanifest med ikonreferenser |
| `favicon-snippet.html` | - | Färdiga HTML-länktaggar |

## Exempelbegäran {#example-request}

Enstaka källbild med rundade hörn och utfyllnad:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Flera källbilder (varje får sin egen uppsättning i en undermapp):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Exempelsvar {#example-response}

Svaret är en ZIP-fil som strömmas direkt. Svarshuvudena är:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Inkluderat HTML-utdrag {#html-snippet-included}

ZIP-filen innehåller en `favicon-snippet.html`-fil som du kan klistra in i din HTML-`<head>`:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Anmärkningar {#notes}

- Källbilder storleksändras med fit-läget `cover`, vilket innebär att de beskärs för att fylla varje kvadratisk storlek. För bästa resultat, använd en kvadratisk källbild.
- När flera filer laddas upp får varje sin egen undermapp i ZIP-filen (namngiven efter källfilen).
- Vid uppladdning av en enda fil ligger alla utdata i roten av ZIP-filen utan undermapp.
- Filer som misslyckas med validering eller avkodning hoppas över, och en `skipped-files.txt` inkluderas i ZIP-filen som förklarar problemen.
- Format som stöds för inmatning: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD med flera.
- EXIF-orientering tillämpas automatiskt före storleksändring.
