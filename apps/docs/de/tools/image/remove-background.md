---
description: "KI-gestützte Hintergrundentfernung mit optionalen Effekten (Weichzeichnen, Schatten, Verlauf, eigener Hintergrund)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 2f566832b26c
---

# Hintergrund entfernen {#remove-background}

KI-gestützte Hintergrundentfernung mit optionalen Effekten (Weichzeichnen, Schatten, Verlauf, eigener Hintergrund).

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundle:** `background-removal` (4-5 GB)

## Parameter {#parameters}

Phase 1 entfernt den Hintergrund und speichert die transparente PNG-Maske sowie das Originalbild zwischen. Das Ersetzen des Hintergrunds, Weichzeichnen, der Schlagschatten und die Konvertierung des Ausgabeformats werden in [Phase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) angewendet (oder wenn `remove-background` als Pipeline-Schritt oder Stapeljob läuft); werden diese Felder an Phase 1 übergeben, gibt es 400 zurück.

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| model | string | Nein | - | Zu verwendende KI-Modellvariante |
| edgeRefine | integer | Nein | - | Stufe der Kantenverfeinerung (0-3) |
| decontaminate | boolean | Nein | - | Farbüberläufe an den Kanten entfernen |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
```

## Antwort {#response}

### Erste Antwort (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Fortschritt (SSE unter `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effekt-Endpunkt (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Wendet Hintergrundeffekte erneut an, ohne das KI-Modell neu auszuführen. Verwendet die zwischengespeicherte Maske und das Original aus Phase 1.

### Parameter {#parameters-1}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| settings | JSON | Ja | - | JSON mit Effekteinstellungen (siehe unten) |
| backgroundImage | file | Nein | - | Eigenes Hintergrundbild (wenn backgroundType `image` ist) |

#### JSON-Felder der Einstellungen {#settings-json-fields}

| Feld | Typ | Erforderlich | Standard | Beschreibung |
|-------|------|----------|---------|-------------|
| jobId | string | Ja | - | Job-ID aus Phase 1 |
| filename | string | Ja | - | Ursprünglicher Dateiname aus Phase 1 |
| backgroundType | string | Nein | `"transparent"` | Eines von: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Nein | - | Hex-Farbe für einfarbigen Hintergrund: `#RRGGBB` oder `#RGB` (das `#` ist optional) |
| gradientColor1 | string | Nein | - | Erste Verlaufsfarbe, Hex wie `backgroundColor` |
| gradientColor2 | string | Nein | - | Zweite Verlaufsfarbe, Hex wie `backgroundColor` |
| gradientAngle | number | Nein | - | Verlaufswinkel in Grad |
| blurEnabled | boolean | Nein | - | Hintergrund-Weichzeichnung aktivieren; zeichnet den ursprünglichen Hintergrund hinter dem Motiv weich (wird durch `backgroundType: "blur"` impliziert) |
| blurIntensity | number | Nein | - | Weichzeichnungsintensität (0-100) |
| shadowEnabled | boolean | Nein | - | Schlagschatten aktivieren |
| shadowOpacity | number | Nein | `35` | Deckkraft des Schattens (0-100); wird verwendet, wenn `shadowEnabled` true ist |
| outputFormat | string | Nein | `"png"` | `png`, `webp` oder `avif` |

### Beispielanfrage {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Antwort (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### Fehler: Hintergrundentfernung abgelaufen (410) {#error-background-removal-expired-410}

Der Effekt-Endpunkt arbeitet mit der Maske und dem Original, die Phase 1 für `jobId` gespeichert hat. Gespeicherte Ausgaben werden nach einiger Zeit bereinigt; vergeht also zu viel Zeit zwischen den beiden Aufrufen, sind sie nicht mehr vorhanden. Phase 1 erneut mit demselben Bild ausführen und die zurückgegebene `jobId` verwenden.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

Eine `jobId` oder ein `filename`, die bzw. der keine gespeicherte Datei benennen kann (ein Pfadtrennzeichen, `..`, eine leere Zeichenkette), wird mit 400 beantwortet.

## Hinweise {#notes}

- Erfordert das installierte Modell-Bundle `background-removal` (4-5 GB).
- Phase 1 speichert die transparente Maske und das Originalbild zwischen, sodass Phase 2 (Effekte) verschiedene Hintergründe sofort erneut anwenden kann, ohne das KI-Modell neu auszuführen.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
- Die EXIF-Rotation wird vor der Verarbeitung automatisch korrigiert.
