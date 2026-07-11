---
description: "Genera tutte le dimensioni standard di favicon e icone app da un'immagine sorgente."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: c2733bdc1752
---

# Generatore di Favicon {#favicon-generator}

Genera un set completo di file favicon e icone app da un'immagine sorgente. Produce tutte le dimensioni standard necessarie per browser, dispositivi Apple e Android, insieme a un web manifest e a uno snippet HTML.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Accetta dati di form multipart con uno o più file immagine e un campo JSON `settings` opzionale.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| background | string | No | - | Colore di sfondo esadecimale (es. `"#ffffff"`). Quando impostato, l'icona viene appiattita su questo colore. |
| padding | integer | No | `0` | Percentuale di padding attorno al contenuto dell'icona (da 0 a 40) |
| radius | integer | No | `0` | Percentuale del raggio degli angoli per icone arrotondate (da 0 a 50) |
| sizes | integer[] | No | - | Limita l'output a dimensioni specifiche in pixel (es. `[16, 32, 180]`). Ometti per generare tutte le dimensioni standard. |
| themeColor | string | No | `"#ffffff"` | Colore del tema esadecimale per il web manifest |

## File Generati {#generated-files}

Per ogni immagine di input vengono prodotti i seguenti file:

| File | Dimensione | Scopo |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Icona della scheda del browser |
| `favicon-32x32.png` | 32x32 | Icona della scheda del browser (HiDPI) |
| `favicon-48x48.png` | 48x48 | Scorciatoia desktop |
| `apple-touch-icon.png` | 180x180 | Schermata home iOS |
| `android-chrome-192x192.png` | 192x192 | Schermata home Android |
| `android-chrome-512x512.png` | 512x512 | Schermata di avvio Android |
| `favicon.ico` | 32x32 | Formato ICO legacy |
| `manifest.json` | - | Web app manifest con riferimenti alle icone |
| `favicon-snippet.html` | - | Tag link HTML pronti all'uso |

## Richiesta di Esempio {#example-request}

Singola immagine sorgente con angoli arrotondati e padding:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Più immagini sorgente (ognuna ottiene il proprio set in una sottocartella):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Risposta di Esempio {#example-response}

La risposta è un file ZIP trasmesso direttamente in streaming. Gli header della risposta sono:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Snippet HTML Incluso {#html-snippet-included}

Lo ZIP include un file `favicon-snippet.html` che puoi incollare nell'`<head>` del tuo HTML:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Note {#notes}

- Le immagini sorgente vengono ridimensionate usando la modalità di adattamento `cover`, il che significa che vengono ritagliate per riempire ogni dimensione quadrata. Per risultati ottimali, usa un'immagine sorgente quadrata.
- Quando vengono caricati più file, ognuno ottiene la propria sottocartella nello ZIP (nominata in base al file sorgente).
- Per il caricamento di un singolo file, tutti gli output si trovano nella radice dello ZIP senza sottocartella.
- I file che non superano la validazione o la decodifica vengono saltati, e un `skipped-files.txt` viene incluso nello ZIP per spiegare i problemi.
- Formati di input supportati: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD e altri.
- L'orientamento EXIF viene applicato automaticamente prima del ridimensionamento.
