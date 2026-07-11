---
description: "Rileva immagini duplicate e quasi duplicate usando l'hashing percettivo."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: fcd167818bf0
---

# Trova Duplicati {#find-duplicates}

Carica più immagini per rilevare duplicati e quasi duplicati usando l'hashing percettivo (dHash). Raggruppa le immagini simili, identifica la versione di migliore qualità in ogni gruppo e calcola il potenziale risparmio di spazio.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Accetta dati di form multipart con più file immagine e un campo JSON `settings` opzionale.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| threshold | number | No | `8` | Distanza di Hamming massima per considerare le immagini come duplicate (da 0 a 20). Più basso = corrispondenza più rigorosa |

### Campi File {#file-fields}

Carica almeno 2 file immagine nella richiesta multipart (tutti usando il nome di campo `file` o qualsiasi nome di campo per le parti file).

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Risposta di Esempio {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Campi della Risposta {#response-fields}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| totalImages | number | Numero di immagini analizzate con successo |
| duplicateGroups | array | Gruppi di immagini duplicate |
| uniqueImages | number | Numero di immagini non appartenenti ad alcun gruppo di duplicati |
| spaceSaveable | number | Totale dei byte che potrebbero essere risparmiati rimuovendo i duplicati non migliori |
| skippedFiles | array | File che non è stato possibile elaborare (con nome file e motivo) |

### Oggetto Gruppo di Duplicati {#duplicate-group-object}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| groupId | number | Identificatore del gruppo |
| files | array | Immagini in questo gruppo di duplicati |

### Oggetto File (all'interno di un gruppo) {#file-object-within-a-group}

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| filename | string | Nome file originale |
| similarity | number | Percentuale di somiglianza rispetto all'immagine di riferimento (la prima del gruppo) |
| width | number | Larghezza dell'immagine in pixel |
| height | number | Altezza dell'immagine in pixel |
| fileSize | number | Dimensione del file in byte |
| format | string | Formato dell'immagine |
| isBest | boolean | Se questa è la versione di qualità più alta (più pixel, file più grande) |
| thumbnail | string o null | Miniatura JPEG in Base64 (larga 200px) per l'anteprima |

## Note {#notes}

- Usa un dHash a 128 bit (64 bit di riga + 64 bit di colonna) per il rilevamento della somiglianza percettiva. Questo intercetta i duplicati anche attraverso ridimensionamenti, ricompressioni e modifiche minori.
- La soglia rappresenta la distanza di Hamming massima tra gli hash. Il valore predefinito di 8 intercetta i quasi duplicati evitando i falsi positivi. Usa 0 per soli duplicati identici a livello di pixel, oppure 15-20 per una corrispondenza molto larga.
- L'immagine "migliore" in ogni gruppo è quella con più pixel (larghezza x altezza), con la dimensione del file come criterio di spareggio.
- Sono richieste almeno 2 immagini. I file che non superano la validazione o la decodifica vengono segnalati in `skippedFiles` invece di far fallire l'intera richiesta.
- Le miniature sono anteprime JPEG larghe 200px codificate come data URI.
- Sono supportati tutti i formati comuni (HEIC, RAW, PSD, SVG decodificati automaticamente).
