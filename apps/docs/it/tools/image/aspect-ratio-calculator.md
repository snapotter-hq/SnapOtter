---
description: "Calcola la larghezza o l'altezza mancante che mantiene le proporzioni e semplifica il rapporto."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 6098293fce5d
i18n_hash_version: 2
---

# Calcolatore proporzioni {#aspect-ratio-calculator}

Inserisci larghezza e altezza originali, poi una nuova larghezza o una nuova altezza, e ottieni l'altro lato in modo che le proporzioni restino invariate. Il rapporto viene restituito nella forma più semplice, quindi 1920 × 1080 diventa 16:9. Nell'app web puoi partire da un rapporto comune (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) e passare da orizzontale a verticale.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Accetta un corpo JSON, non dati di form multipart, e risponde con numeri invece di un file da scaricare.

## Parametri {#parameters}

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|-------------|-------------|
| `width` | number | (obbligatorio) | Larghezza originale. |
| `height` | number | (obbligatorio) | Altezza originale. |
| `newWidth` | number | - | Larghezza di destinazione. La risposta ricava `newHeight` da questo valore. |
| `newHeight` | number | - | Altezza di destinazione. La risposta ricava `newWidth` da questo valore. |
| `round` | boolean | `true` | Arrotonda il lato calcolato a un numero intero. Con `false` mantiene due cifre decimali. |

Ogni dimensione deve essere compresa tra `0.0001` e `1000000`. Invia `newWidth` oppure `newHeight`, non entrambi. Omettili entrambi per ottenere solo il rapporto semplificato.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Esempio di risposta {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` e `newHeight` sono `null` quando la richiesta non ne ha inviato nessuno.

## Note {#notes}

- Le dimensioni frazionarie vengono ridotte a un rapporto tra numeri interi usando fino a quattro cifre decimali, quindi `8.5` × `11` diventa `17:22`.
- `ratioDecimal` è la larghezza divisa per l'altezza, arrotondata a quattro cifre decimali.
- Un lato calcolato non viene mai restituito come `0`. Con l'arrotondamento attivo vale almeno `1`, senza arrotondamento almeno `0.01`.
- Inviare insieme `newWidth` e `newHeight`, o una dimensione fuori dall'intervallo consentito, restituisce un errore 400.
- Il calcolatore non legge né scrive mai un file. Per applicare i numeri, usa [Ridimensiona Immagine](/it/tools/image/resize) o [Ritaglia Immagine](/it/tools/image/crop).
