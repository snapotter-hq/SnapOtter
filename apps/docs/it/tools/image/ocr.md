---
description: "Estrai testo dalle immagini localmente con Tesseract integrato o il runtime RapidOCR opzionale ad alta precisione."
i18n_output_hash: 5c65c73856f7
i18n_source_hash: 01c6fa6aebe7
i18n_provenance: human
---

# OCR / Text Extraction {#ocr-text-extraction}

Estrai testo dalle immagini senza inviare l'immagine a un servizio esterno. Il livello `fast` integrato utilizza Tesseract. I livelli opzionali `balanced` e `best` utilizzano RapidOCR con modelli PP-OCR ONNX bloccati.


<!-- korean-ocr-contract:start -->
::: info Compatibilità OCR per il coreano
OCR veloce supporta `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, ma non il coreano (`ko`). Il coreano richiede il pacchetto OCR accurato e `balanced` o `best`. Il pacchetto funziona nei container Linux amd64 e arm64 ufficiali, inclusi gli host NVIDIA, dove l’OCR resta sulla CPU. I sistemi non supportati ricevono un errore di compatibilità esplicito e non passano mai silenziosamente a `fast`. Il coreano con `fast` o con l’alias legacy `tesseract` viene rifiutato prima dell’accodamento con `FEATURE_INCOMPATIBLE` e `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Elaborazione:** Restituisce `200` con JSON quando OCR termina all'interno della finestra sincrona. I lavori più lunghi restituiscono `202`; seguire il flusso di avanzamento SSE del lavoro fino al suo evento terminale, il cui `result` contiene gli stessi campi OCR.

**Pacchetto OCR accurato:** Runtime `ocr` opzionale (circa 208-234 MiB da scaricare e 409-488 MiB installati, a seconda della destinazione). `fast` non richiede questo pacchetto; l'installatore verifica le dimensioni esatte vincolate dall'indice firmato.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | SÌ | - | File immagine (in più parti), fino a 512 MiB codificati e 40 megapixel decodificati; si applica ancora un limite di caricamento da parte dell'operatore inferiore |
| quality | string | NO | Dinamico | Livello di qualità: `fast` (Tesseract), `balanced` (RapidOCR con i modelli PP-OCRv6 piccoli) o `best` (i modelli PP-OCRv6 medi con precisione più elevata con punteggio delle varianti calibrato) |
| language | string | No | `"auto"` | Suggerimento sulla lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | NO | Dipendente dal livello | Migliora il contrasto locale prima del riconoscimento. Fast lo applica direttamente; Bilanciato e Migliore mantengono la variante solo quando il punteggio calibrato migliora il risultato. Il valore predefinito è `true` per `best` e `false` per `fast`/`balanced` |
| engine | string | NO | - | Alias ​​di compatibilità deprecato. Utilizzare invece `quality`. `tesseract` è mappato su `fast`; il valore `paddleocr` legacy viene mappato su `balanced` ma non carica PaddlePaddle |

Quando `quality` e `engine` sono omessi, SnapOtter sceglie il livello migliore disponibile nell’ordine `best`, `balanced`, `fast`. Per il coreano non sceglie mai `fast`: usa `best`, poi `balanced`, oppure restituisce l’errore di installazione o compatibilità del runtime accurato.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "rapidocr-onnx",
  "requestedQuality": "best",
  "actualQuality": "best",
  "device": "cpu",
  "provider": "CPUExecutionProvider",
  "degraded": false,
  "warnings": [],
  "runtimeVersion": "2.1.0",
  "modelVersion": "PP-OCRv6-best-v1-medium"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

Se viene fornito un campo modulo `clientJobId`, gli eventi di avanzamento vengono trasmessi in streaming. Una risposta `202` significa che il client deve mantenere il flusso aperto fino all'evento `complete` o `failed` del terminale:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- `fast` è sempre disponibile nelle immagini SnapOtter supportate. `balanced` e `best` richiedono il pacchetto OCR accurato opzionale.
- Tesseract integrato aggiunge circa 25 MiB all'immagine ufficiale. Il pacchetto accurato viene archiviato in `/data/ai`, non inserito nell'immagine.
- Viene pubblicato il pack accurato per i contenitori ufficiali Linux amd64 e arm64. Utilizza deliberatamente il provider CPU di ONNX Runtime, anche sugli host NVIDIA, quindi non dipende dalle librerie CUDA o dalla compatibilità GPU. Le installazioni bare-metal di origine e predefinite utilizzano OCR veloce a meno che non forniscano il proprio runtime compatibile.
- L'OCR restituisce direttamente il testo estratto anziché un URL di download dell'immagine.
- SnapOtter rispetta un livello esplicitamente richiesto. Se `balanced` o `best` non è disponibile, API restituisce `501` con `FEATURE_NOT_INSTALLED` o `FEATURE_INCOMPATIBLE`; non esegue mai il downgrade silenzioso della richiesta a un altro livello.
- Un risultato vuoto riuscito rimane un risultato vuoto. Gli errori di runtime restituiscono un errore invece di riprovare con un motore di qualità inferiore.
- La risposta riporta sia `requestedQuality` che `actualQuality`, oltre alle versioni del motore, del dispositivo, del provider, del runtime e del modello ed eventuali avvisi.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
- Gli ingressi codificati sovradimensionati restituiscono `413`. Le immagini superiori a 40 megapixel e le risposte OCR che superano i limiti di output vengono rifiutate invece di essere parzialmente elaborate.
