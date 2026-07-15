---
description: "Modifica i campi di metadati EXIF, IPTC, GPS e XMP nelle immagini senza ricodificare i pixel."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 9b741b767435
---

# Modifica metadati immagine {#edit-metadata}

Modifica i campi di metadati dell'immagine inclusi EXIF, IPTC, coordinate GPS, date e parole chiave. Usa ExifTool internamente, quindi i metadati vengono scritti in-place senza ricodificare i pixel, preservando la piena qualità dell'immagine.

## Endpoint API {#api-endpoints}

### Modifica metadati {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Scrive i campi di metadati nell'immagine e restituisce il file modificato.

### Ispeziona metadati {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Restituisce i metadati completi dall'immagine tramite ExifTool come JSON. Non modifica l'immagine.

## Parametri (Modifica) {#parameters-edit}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Titolo dell'immagine (XMP/EXIF) |
| author | string | No | - | Nome dell'autore |
| artist | string | No | - | Nome dell'artista (tag EXIF Artist) |
| copyright | string | No | - | Nota di copyright |
| imageDescription | string | No | - | Descrizione dell'immagine (EXIF) |
| software | string | No | - | Tag del software |
| dateTime | string | No | - | Valore EXIF DateTime |
| dateTimeOriginal | string | No | - | Valore EXIF DateTimeOriginal |
| setAllDates | string | No | - | Imposta tutti i campi data contemporaneamente |
| dateShift | string | No | - | Sposta tutte le date di un offset (formato: `+HH:MM` o `-HH:MM`) |
| clearGps | boolean | No | `false` | Rimuovi tutti i dati GPS |
| gpsLatitude | number | No | - | Imposta la latitudine GPS (da -90 a 90) |
| gpsLongitude | number | No | - | Imposta la longitudine GPS (da -180 a 180) |
| gpsAltitude | number | No | - | Imposta l'altitudine GPS in metri |
| keywords | string[] | No | - | Parole chiave/tag da aggiungere o impostare |
| keywordsMode | string | No | `"add"` | Come gestire le parole chiave: `add` (aggiungi) o `set` (sostituisci) |
| fieldsToRemove | string[] | No | `[]` | Elenco di nomi specifici di campi di metadati da rimuovere |
| iptcTitle | string | No | - | IPTC Object Name |
| iptcHeadline | string | No | - | IPTC Headline |
| iptcCity | string | No | - | IPTC City |
| iptcState | string | No | - | IPTC Province/State |
| iptcCountry | string | No | - | IPTC Country |

## Esempio di richiesta {#example-request}

Imposta autore e copyright:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Imposta le coordinate GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Rimuovi il GPS e aggiungi parole chiave:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Ispeziona i metadati:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Esempio di risposta (Modifica) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Note {#notes}

- Questo strumento richiede che ExifTool sia installato sul server. È incluso nell'immagine Docker.
- I metadati vengono scritti in-place, quindi non si verifica alcuna ricodifica dei pixel. La variazione di dimensione del file è minima (solo i byte dei metadati).
- Il parametro `dateShift` sposta tutti i campi data dell'offset specificato, utile per correggere errori di fuso orario (es. `+02:00` o `-05:30`).
- Se non viene richiesta alcuna modifica (tutti i parametri omessi o vuoti), il file originale viene restituito invariato.
- Formati supportati: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Per i formati non visualizzabili in anteprima nel browser (HEIF, TIFF), la risposta include un campo `previewUrl` con un'anteprima WebP.
