---
description: "Sovrapponi immagini con posizione, opacità e modalità di fusione per il compositing."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 8c43a20dfe1f
---

# Composizione immagini {#image-composition}

Sovrapponi un'immagine in overlay sopra un'immagine di base con posizione, opacità e modalità di fusione configurabili. Utile per comporre loghi, grafica o combinare più immagini.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/compose`

Accetta dati di form multipart con **due** file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| x | number | No | `0` | Offset orizzontale dell'overlay dall'angolo in alto a sinistra in pixel (min 0) |
| y | number | No | `0` | Offset verticale dell'overlay dall'angolo in alto a sinistra in pixel (min 0) |
| opacity | number | No | `100` | Percentuale di opacità dell'overlay (da 0 a 100) |
| blendMode | string | No | `"over"` | Modalità di fusione del compositing |

### Modalità di fusione {#blend-modes}

| Valore | Descrizione |
|-------|-------------|
| `over` | Overlay normale (predefinito) |
| `multiply` | Scurisci moltiplicando i valori dei pixel |
| `screen` | Schiarisci invertendo, moltiplicando e invertendo di nuovo |
| `overlay` | Combina multiply e screen in base alla luminosità della base |
| `darken` | Mantieni il pixel più scuro di ciascun livello |
| `lighten` | Mantieni il pixel più chiaro di ciascun livello |
| `hard-light` | Overlay a forte contrasto |
| `soft-light` | Overlay a contrasto tenue |
| `difference` | Differenza assoluta tra i livelli |
| `exclusion` | Simile a difference ma con contrasto minore |

### Campi dei file {#file-fields}

| Nome del campo | Obbligatorio | Descrizione |
|------------|----------|-------------|
| file | Sì | L'immagine di base/sfondo |
| overlay | Sì | L'immagine in overlay/primo piano |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Usando la modalità di fusione multiply:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Note {#notes}

- Entrambe le immagini vengono validate e decodificate (HEIC, RAW, PSD, SVG supportati) prima del compositing.
- L'overlay viene posizionato alle coordinate esatte in pixel specificate da `x` e `y`. Non viene ridimensionato per adattarsi.
- Se l'opacità è inferiore a 100, una maschera alfa viene applicata all'overlay prima della fusione.
- L'overlay può estendersi oltre i confini dell'immagine di base (verrà ritagliato).
- L'orientamento EXIF viene applicato automaticamente su entrambe le immagini prima dell'elaborazione.
- Le dimensioni di output corrispondono alle dimensioni dell'immagine di base.
