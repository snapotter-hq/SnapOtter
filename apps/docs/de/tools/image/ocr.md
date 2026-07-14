---
description: "Extrahieren Sie Text lokal aus Bildern mit dem integrierten Tesseract oder der optionalen hochpräzisen RapidOCR-Laufzeitumgebung."
i18n_output_hash: 7455d3e3f8ff
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Textextraktion {#ocr-text-extraction}

Extrahieren Sie Text aus Bildern, ohne das Bild an einen externen Dienst zu senden. Die integrierte `fast`-Stufe verwendet Tesseract. Die optionalen Ebenen `balanced` und `best` verwenden RapidOCR mit angehefteten PP-OCR ONNX-Modellen.


<!-- korean-ocr-contract:start -->
::: info Kompatibilität für koreanische OCR
Fast OCR unterstützt `auto`, `en`, `de`, `es`, `fr`, `zh` und `ja`, aber kein Koreanisch (`ko`). Koreanisch benötigt das genaue OCR-Paket und `balanced` oder `best`. Das Paket läuft in offiziellen Linux-amd64- und arm64-Containern, auch auf NVIDIA-Hosts weiterhin auf der CPU. Nicht unterstützte Systeme erhalten einen eindeutigen Kompatibilitätsfehler und keinen stillen Rückfall auf `fast`. Koreanisch mit `fast` oder dem alten Alias `tesseract` wird vor dem Einreihen mit `FEATURE_INCOMPATIBLE` und `fast-korean-unsupported` abgelehnt.
:::
<!-- korean-ocr-contract:end -->
## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Verarbeitung:** OCR wird immer asynchron ausgeführt. Nach Validierung und Einreihung gibt der Endpunkt sofort `202 Accepted` mit einer `jobId` zurück. Verfolgen Sie den SSE-Fortschrittsstrom des Jobs bis zum abschließenden Ereignis `complete` oder `failed`; bei Erfolg enthält dessen `result` die OCR-Felder.

**Genaues OCR-Paket:** Optionale `ocr`-Laufzeit (ca. 208–234 MiB zum Herunterladen und 409–488 MiB installiert, je nach Ziel). Für `fast` ist dieses Paket nicht erforderlich. Das Installationsprogramm überprüft die genauen Größen, die durch den signierten Index gebunden sind.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (mehrteilig), bis zu 512 MiB kodiert und 40 Megapixel dekodiert; Es gilt weiterhin ein niedrigeres Upload-Limit des Betreibers |
| quality | string | NEIN | Dynamisch | Qualitätsstufe: `fast` (Tesseract), `balanced` (RapidOCR mit den kleinen PP-OCRv6-Modellen) oder `best` (die höhergenauen mittleren PP-OCRv6-Modelle mit kalibrierter Variantenbewertung) |
| language | string | Nein | `"auto"` | Sprachhinweis: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | NEIN | Tierabhängig | Verbessern Sie den lokalen Kontrast vor der Erkennung. Fast wendet es direkt an; „Balanced“ und „Best“ behalten die Variante nur dann bei, wenn die kalibrierte Bewertung das Ergebnis verbessert. Standardmäßig ist `true` für `best` und `false` für `fast`/`balanced` |
| engine | string | NEIN | - | Veralteter Kompatibilitätsalias. Verwenden Sie stattdessen `quality`. `tesseract` wird auf `fast` abgebildet; Der alte Wert `paddleocr` wird `balanced` zugeordnet, lädt PaddlePaddle jedoch nicht |

Wenn `quality` und `engine` fehlen, wählt SnapOtter die höchste verfügbare Stufe in dieser Reihenfolge: `best`, `balanced`, `fast`. Für Koreanisch wird `fast` nie gewählt; es wird `best`, dann `balanced` verwendet oder ein Installations- bzw. Kompatibilitätsfehler der genauen Laufzeit zurückgegeben.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Angenommene Antwort (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Fortschritt und Ergebnis (SSE) {#progress-sse-optional}

Verbinden Sie sich mit `GET /api/v1/jobs/{jobId}/progress` und verwenden Sie die `jobId` aus der `202`-Antwort (oder die übergebene `clientJobId`). Halten Sie den Stream bis zum abschließenden Ereignis `complete` oder `failed` offen. Ein erfolgreiches Terminal-Frame enthält die OCR-Ausgabe in `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
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
}
```

Verarbeitungsfehler werden im Feld `error` des abschließenden Ereignisses `failed` übertragen; nach dem Einreihen werden sie nicht als HTTP `422` zurückgegeben.

## Hinweise {#notes}

- `fast` ist immer in unterstützten SnapOtter-Images verfügbar. `balanced` und `best` erfordern das optionale genaue OCR-Paket.
- Das integrierte Tesseract fügt dem offiziellen Bild etwa 25 MiB hinzu. Das genaue Paket wird in `/data/ai` gespeichert und nicht in das Bild eingebrannt.
- Das genaue Paket wird für die offiziellen Container Linux amd64 und arm64 veröffentlicht. Es verwendet bewusst den CPU-Anbieter von ONNX Runtime, auch auf NVIDIA-Hosts, sodass es nicht auf CUDA-Bibliotheken oder GPU-Kompatibilität angewiesen ist. Quelle und vorgefertigt bare-metal Installationen verwenden Fast OCR es sei denn, sie stellen ihre eigene kompatible Laufzeit bereit.
- Das erfolgreiche Terminal-`result` enthält sowohl den extrahierten Text in `text` als auch ein herunterladbares `.txt`-Artefakt in `downloadUrl`.
– SnapOtter berücksichtigt eine explizit angeforderte Stufe. Wenn `balanced` oder `best` nicht verfügbar ist, der API gibt `501` mit `FEATURE_NOT_INSTALLED` oder `FEATURE_INCOMPATIBLE` zurück; Die Anfrage wird niemals stillschweigend auf eine andere Ebene herabgestuft.
- Ein erfolgreiches leeres Ergebnis bleibt ein leeres Ergebnis. Laufzeitfehler geben einen Fehler zurück, anstatt es erneut mit einer Engine mit geringerer Qualität zu versuchen.
– Das erfolgreiche Terminal-`result` meldet sowohl `requestedQuality` als auch `actualQuality` sowie die Engine-, Geräte-, Anbieter-, Laufzeit- und Modellversionen sowie etwaige Warnungen.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
– Übergroße codierte Eingaben geben `413` zurück. Bilder über 40 Megapixel und OCR-Antworten, die ihre begrenzten Ausgabegrenzen überschreiten, werden abgelehnt, anstatt teilweise verarbeitet zu werden.
