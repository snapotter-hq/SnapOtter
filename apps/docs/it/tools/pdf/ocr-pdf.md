---
description: "Estrai testo dai PDF scansionati localmente con Tesseract integrato o il runtime RapidOCR opzionale ad alta precisione."
i18n_output_hash: cae7ce183801
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# OCR PDF {#pdf-ocr}

Estrai il testo dai documenti PDF scansionati pagina per pagina senza inviare PDF a un servizio esterno. Il livello `fast` integrato utilizza Tesseract. I livelli opzionali `balanced` e `best` utilizzano RapidOCR con modelli PP-OCR ONNX bloccati.


<!-- korean-ocr-contract:start -->
::: info Compatibilità OCR per il coreano
OCR veloce supporta `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, ma non il coreano (`ko`). Il coreano richiede il pacchetto OCR accurato e `balanced` o `best`. Il pacchetto funziona nei container Linux amd64 e arm64 ufficiali, inclusi gli host NVIDIA, dove l’OCR resta sulla CPU. I sistemi non supportati ricevono un errore di compatibilità esplicito e non passano mai silenziosamente a `fast`. Il coreano con `fast` o con l’alias legacy `tesseract` viene rifiutato prima dell’accodamento con `FEATURE_INCOMPATIBLE` e `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON opzionale `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | SÌ | - | File PDF (multiparte), fino a 512 MiB codificati; si applica ancora un limite di caricamento da parte dell'operatore inferiore |
| quality | string | NO | Dinamico | Livello di qualità OCR: `fast`, `balanced` o `best` |
| language | string | No | `"auto"` | Lingua del documento: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Selezione delle pagine, es. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | NO | Dipendente dal livello | Migliora il contrasto locale prima del riconoscimento. Fast lo applica direttamente; Bilanciato e Migliore mantengono la variante solo quando il punteggio calibrato migliora il risultato. Il valore predefinito è `true` per `best` e `false` per `fast`/`balanced` |
| engine | string | NO | - | Alias ​​di compatibilità deprecato. Utilizzare invece `quality`. `tesseract` è mappato su `fast`; il valore `paddleocr` legacy viene mappato su `balanced` ma non carica PaddlePaddle |

Quando `quality` e `engine` sono omessi, SnapOtter sceglie il livello migliore disponibile nell’ordine `best`, `balanced`, `fast`. Per il coreano non sceglie mai `fast`: usa `best`, poi `balanced`, oppure restituisce l’errore di installazione o compatibilità del runtime accurato.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Restituisce `202 Accepted`. Monitora l'avanzamento tramite SSE su `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- `fast` è integrato e aggiunge circa 25 MiB all'immagine ufficiale. `balanced` e `best` richiedono il pacchetto OCR accurato opzionale (circa 208-234 MiB da scaricare e 409-488 MiB installati, a seconda dell'obiettivo).
- Il pacchetto accurato supporta Linux amd64 e arm64 e utilizza ONNX Runtime su CPU, inclusi gli host NVIDIA.
- Un livello richiesto esplicitamente non viene mai declassato silenziosamente. Se `balanced` o `best` non è disponibile, API restituisce `501` con `FEATURE_NOT_INSTALLED` o `FEATURE_INCOMPATIBLE`.
- Le pagine PDF vengono rasterizzate ad alta risoluzione prima di OCR. `best` esegue i modelli PP-OCRv6 medi ad alta precisione e valuta le varianti di orientamento e miglioramento, migliorando il riconoscimento a scapito della velocità.
- L'impostazione della lingua `auto` consente il riconoscimento attraverso il set di script supportato; un suggerimento esplicito può migliorare i risultati per una lingua di documento conosciuta.
- Puoi selezionare pagine specifiche usando intervalli (`"1-3"`), elenchi separati da virgole (`"1,3,5"`), o `"all"` per ogni pagina.
- Una richiesta può elaborare un massimo di 50 pagine. I dati scratch rasterizzati sono limitati a 512 MiB e la risposta aggregata UTF-8 OCR è limitata a 1.000.000 di byte; i lavori con limite eccessivo falliscono anziché restituire testo parziale.
- Per i PDF che contengono già testo selezionabile, considera l'uso dello strumento più veloce [PDF in testo](./pdf-to-text).
