---
description: "KI-gestützter Generator für Pass- und Ausweisfotos mit Gesichtserkennung, Hintergrundentfernung und Kachelung für Druckbögen."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 4dfcdaf3b7f5
---

# Passfoto {#passport-photo}

KI-gestützter Generator für Pass- und Ausweisfotos. Zweiphasiger Ablauf: Analysieren (Gesichtserkennung + Hintergrundentfernung), dann Generieren (Zuschneiden, Größenänderung und Kachelung für den Druck).

## API-Endpunkte {#api-endpoints}

Dieses Werkzeug verwendet einen zweiphasigen Ablauf mit getrennten Endpunkten für Analyse und Generierung.

**Modell-Bundles:** `background-removal` und `face-detection`

---

### Phase 1: Analysieren {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Erkennt Gesichtsmerkmale und entfernt den Hintergrund. Gibt Merkmalsdaten und eine Vorschau zurück, damit das Frontend eine Zuschnitt-Vorschau anzeigen kann.

#### Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| clientJobId | string | Nein | - | Optionale Job-ID zur Fortschrittsverfolgung über SSE |

#### Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Antwort (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Fortschritt (SSE, optional) {#progress-sse-optional}

Wenn `clientJobId` angegeben ist, wird der Fortschritt gestreamt (0-30 % für die Gesichtserkennung, 30-95 % für die Hintergrundentfernung).

#### Fehler: Kein Gesicht erkannt (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generieren {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Schneidet das Foto zu, ändert die Größe und kachelt es optional auf einen Druckbogen. Verwendet zwischengespeicherte Bilder aus Phase 1 (kein erneuter KI-Durchlauf).

#### Parameter (JSON-Body) {#parameters-json-body}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| jobId | string | Ja | - | Job-ID aus Phase 1 |
| filename | string | Ja | - | Ursprünglicher Dateiname aus Phase 1 |
| countryCode | string | Ja | - | Ländercode für die Pass-Spezifikation (z. B. `US`, `GB`, `IN`) |
| documentType | string | Nein | `"passport"` | Dokumenttyp (aus der Länderspezifikation) |
| bgColor | string | Nein | `"#FFFFFF"` | Hintergrundfarbe als Hex |
| printLayout | string | Nein | `"none"` | Druckpapier-Layout: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Nein | `0` | Beschränkung der maximalen Dateigröße in KB (0 = keine Begrenzung) |
| dpi | number | Nein | `300` | Ausgabe-DPI (72-1200) |
| customWidthMm | number | Nein | - | Eigene Fotobreite in mm (überschreibt die Länderspezifikation) |
| customHeightMm | number | Nein | - | Eigene Fotohöhe in mm (überschreibt die Länderspezifikation) |
| zoom | number | Nein | `1` | Zoomfaktor (0,5-3). Werte > 1 schneiden enger zu |
| adjustX | number | Nein | `0` | Horizontale Positionsanpassung |
| adjustY | number | Nein | `0` | Vertikale Positionsanpassung |
| landmarks | object | Ja | - | Merkmals-Objekt aus der Antwort von Phase 1 |
| imageWidth | number | Ja | - | Bildbreite aus der Antwort von Phase 1 |
| imageHeight | number | Ja | - | Bildhöhe aus der Antwort von Phase 1 |

#### Beispielanfrage {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Antwort (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Basis-Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

Gibt einen Hinweis zurück, den korrekten Unter-Endpunkt zu verwenden.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Hinweise {#notes}

- Erfordert die installierten Modell-Bundles `background-removal` und `face-detection`.
- Phase 1 führt KI aus (Gesichtsmerkmale + Hintergrundentfernung) und speichert die Ergebnisse zwischen. Phase 2 ist reine Sharp-Bildbearbeitung (schnell, ohne KI).
- Merkmale werden als normalisierte Koordinaten zurückgegeben (Bereich 0-1 relativ zu den Bildabmessungen).
- Das Feld `preview` in der Analyse-Antwort ist ein Base64-kodiertes PNG (maximal 800 px breit) für eine schnelle Anzeige.
- Länderspezifikationen enthalten Dokumentabmessungen, Verhältnisse für die Kopfhöhe und die Positionierung der Augenlinie gemäß offiziellen Anforderungen an Passfotos.
- Die Option `printLayout` erzeugt einen gekachelten Bogen auf 4x6\"- oder A4-Papier mit 2 mm Abstand zwischen den Fotos.
- Wenn `maxFileSizeKb` gesetzt ist, wird die Ausgabe iterativ komprimiert, um innerhalb der Größenbeschränkung zu bleiben.
