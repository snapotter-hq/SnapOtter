---
description: "Generator zdjęć paszportowych i do dokumentów wspomagany AI z wykrywaniem twarzy, usuwaniem tła i układaniem na arkuszu do druku."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: e7771c6de920
---

# Zdjęcie paszportowe {#passport-photo}

Generator zdjęć paszportowych i do dokumentów wspomagany AI. Dwuetapowy przepływ pracy: analiza (wykrywanie twarzy + usuwanie tła), a następnie generowanie (kadrowanie, zmiana rozmiaru i układanie do druku).

## Punkty końcowe API {#api-endpoints}

To narzędzie używa dwuetapowego przepływu z osobnymi punktami końcowymi do analizy i generowania.

**Pakiety modeli:** `background-removal` i `face-detection`

---

### Etap 1: Analiza {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Wykrywa punkty charakterystyczne twarzy i usuwa tło. Zwraca dane punktów charakterystycznych oraz podgląd, aby frontend mógł wyświetlić podgląd kadrowania.

#### Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| clientJobId | string | Nie | - | Opcjonalne ID zadania do śledzenia postępu przez SSE |

#### Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Odpowiedź (200 OK) {#response-200-ok}

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

#### Postęp (SSE, opcjonalnie) {#progress-sse-optional}

Jeśli podano `clientJobId`, postęp jest strumieniowany (0-30% dla wykrywania twarzy, 30-95% dla usuwania tła).

#### Błąd: Nie wykryto twarzy (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Etap 2: Generowanie {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Kadruje, zmienia rozmiar i opcjonalnie układa zdjęcie na arkuszu do druku. Korzysta z obrazów zapisanych w pamięci podręcznej z Etapu 1 (bez ponownego uruchamiania AI).

#### Parametry (treść JSON) {#parameters-json-body}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| jobId | string | Tak | - | ID zadania z Etapu 1 |
| filename | string | Tak | - | Oryginalna nazwa pliku z Etapu 1 |
| countryCode | string | Tak | - | Kod kraju dla specyfikacji paszportu (np. `US`, `GB`, `IN`) |
| documentType | string | Nie | `"passport"` | Typ dokumentu (ze specyfikacji kraju) |
| bgColor | string | Nie | `"#FFFFFF"` | Kolor tła w formacie hex |
| printLayout | string | Nie | `"none"` | Układ papieru do druku: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Nie | `0` | Ograniczenie maksymalnego rozmiaru pliku w KB (0 = bez limitu) |
| dpi | number | Nie | `300` | DPI wyjścia (72-1200) |
| customWidthMm | number | Nie | - | Własna szerokość zdjęcia w mm (nadpisuje specyfikację kraju) |
| customHeightMm | number | Nie | - | Własna wysokość zdjęcia w mm (nadpisuje specyfikację kraju) |
| zoom | number | Nie | `1` | Współczynnik przybliżenia (0.5-3). Wartości > 1 kadrują ciaśniej |
| adjustX | number | Nie | `0` | Korekta położenia w poziomie |
| adjustY | number | Nie | `0` | Korekta położenia w pionie |
| landmarks | object | Tak | - | Obiekt punktów charakterystycznych z odpowiedzi Etapu 1 |
| imageWidth | number | Tak | - | Szerokość obrazu z odpowiedzi Etapu 1 |
| imageHeight | number | Tak | - | Wysokość obrazu z odpowiedzi Etapu 1 |

#### Przykładowe żądanie {#example-request-1}

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

#### Odpowiedź (200 OK) {#response-200-ok-1}

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

### Trasa bazowa {#base-route}

`POST /api/v1/tools/image/passport-photo`

Zwraca wskazówki, aby użyć właściwego podrzędnego punktu końcowego.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Uwagi {#notes}

- Wymaga zainstalowania pakietów modeli `background-removal` i `face-detection`.
- Etap 1 uruchamia AI (punkty charakterystyczne twarzy + usuwanie tła) i zapisuje wyniki w pamięci podręcznej. Etap 2 to czysta manipulacja obrazem w Sharp (szybka, bez potrzeby AI).
- Punkty charakterystyczne są zwracane jako współrzędne znormalizowane (zakres 0-1 względem wymiarów obrazu).
- Pole `preview` w odpowiedzi analizy to zakodowany w base64 obraz PNG (maks. 800px szerokości) dla szybkiego wyświetlania.
- Specyfikacje krajów obejmują wymiary dokumentu, proporcje wysokości głowy i pozycjonowanie linii oczu na podstawie oficjalnych wymagań dotyczących zdjęć paszportowych.
- Opcja `printLayout` generuje arkusz z ułożonymi zdjęciami na papierze 4x6\" lub A4 z 2mm odstępami między zdjęciami.
- Gdy ustawiono `maxFileSizeKb`, wynik jest iteracyjnie kompresowany, aby zmieścić się w limicie rozmiaru.
