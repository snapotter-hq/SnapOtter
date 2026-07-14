---
description: "Extrahieren Sie Text aus gescannten PDFs lokal mit dem integrierten Tesseract oder der optionalen hochpräzisen RapidOCR-Laufzeitumgebung."
i18n_output_hash: e5561369ae27
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

Extrahieren Sie Text aus gescannten Texten PDF Dokumente Seite für Seite, ohne sie zu senden PDF an einen externen Dienst. Der eingebaute `fast` Tier verwendet Tesseract. Die Wahl `balanced` Und `best` Ebenen verwenden RapidOCR mit angeheftet PP-OCR ONNX-Modelle.


<!-- korean-ocr-contract:start -->
::: info Kompatibilität für koreanische OCR
Fast OCR unterstützt `auto`, `en`, `de`, `es`, `fr`, `zh` und `ja`, aber kein Koreanisch (`ko`). Koreanisch benötigt das genaue OCR-Paket und `balanced` oder `best`. Das Paket läuft in offiziellen Linux-amd64- und arm64-Containern, auch auf NVIDIA-Hosts weiterhin auf der CPU. Nicht unterstützte Systeme erhalten einen eindeutigen Kompatibilitätsfehler und keinen stillen Rückfall auf `fast`. Koreanisch mit `fast` oder dem alten Alias `tesseract` wird vor dem Einreihen mit `FEATURE_INCOMPATIBLE` und `fast-korean-unsupported` abgelehnt.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem optionalen JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | PDF-Datei (mehrteilig), bis zu 512 MiB-kodiert; Es gilt weiterhin ein niedrigeres Upload-Limit des Betreibers |
| quality | string | NEIN | Dynamisch | OCR-Qualitätsstufe: `fast`, `balanced` oder `best` |
| language | string | Nein | `"auto"` | Dokumentsprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Nein | `"all"` | Seitenauswahl, z. B. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | NEIN | Tierabhängig | Verbessern Sie den lokalen Kontrast vor der Erkennung. Fast wendet es direkt an; „Balanced“ und „Best“ behalten die Variante nur dann bei, wenn die kalibrierte Bewertung das Ergebnis verbessert. Standardmäßig ist `true` für `best` und `false` für `fast`/`balanced` |
| engine | string | NEIN | - | Veralteter Kompatibilitätsalias. Verwenden Sie stattdessen `quality`. `tesseract` wird auf `fast` abgebildet; Der alte Wert `paddleocr` wird `balanced` zugeordnet, lädt PaddlePaddle jedoch nicht |

Wenn `quality` und `engine` fehlen, wählt SnapOtter die höchste verfügbare Stufe in dieser Reihenfolge: `best`, `balanced`, `fast`. Für Koreanisch wird `fast` nie gewählt; es wird `best`, dann `balanced` verwendet oder ein Installations- bzw. Kompatibilitätsfehler der genauen Laufzeit zurückgegeben.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Gibt `202 Accepted` zurück. Verfolgen Sie den Fortschritt über SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- `fast` ist integriert und fügt dem offiziellen Bild etwa 25 MiB hinzu. `balanced` und `best` erfordern das optionale genaue OCR-Paket (ca. 208–234 MiB zum Herunterladen und 409–488 MiB installiert, je nach Ziel).
– Das genaue Paket unterstützt Linux amd64 und arm64 und verwendet ONNX Runtime auf CPU, einschließlich auf NVIDIA-Hosts.
– Eine explizit angeforderte Stufe wird niemals stillschweigend herabgestuft. Wenn `balanced` oder `best` nicht verfügbar ist, gibt API `501` mit `FEATURE_NOT_INSTALLED` oder `FEATURE_INCOMPATIBLE` zurück.
- PDF-Seiten werden vor OCR mit hoher Auflösung gerastert. `best` führt die mittelgenauen PP-OCRv6-Modelle mit höherer Genauigkeit aus und bewertet Orientierungs- und Verbesserungsvarianten, wodurch die Erkennung auf Kosten der Geschwindigkeit verbessert wird.
– Die Spracheinstellung `auto` ermöglicht die Erkennung im gesamten unterstützten Skriptsatz; Ein expliziter Hinweis kann die Ergebnisse für eine bekannte Dokumentsprache verbessern.
- Sie können bestimmte Seiten über Bereiche (`"1-3"`), kommagetrennte Listen (`"1,3,5"`) oder `"all"` für jede Seite gezielt ansprechen.
- Eine Anfrage kann maximal 50 Seiten verarbeiten. Rasterisierte Scratch-Daten sind auf 512 MiB und die aggregierte UTF-8 OCR-Antwort auf 1.000.000 Bytes begrenzt. Überschreitungsaufträge schlagen fehl, anstatt einen Teiltext zurückzugeben.
- Für PDFs, die bereits auswählbaren Text enthalten, sollten Sie stattdessen das schnellere Tool [PDF zu Text](./pdf-to-text) verwenden.
