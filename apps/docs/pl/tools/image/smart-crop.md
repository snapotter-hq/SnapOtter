---
description: "Kadrowanie uwzględniające obiekt, twarze i entropię, które inteligentnie komponuje obrazy przy użyciu Sharp i wykrywania twarzy przez AI."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: cad4c61cd50b
---

# Inteligentne kadrowanie {#smart-crop}

Inteligentne kadrowanie uwzględniające obiekt, twarze lub przycinanie tła. Wykorzystuje strategie uwagi/entropii Sharp oraz wykrywanie twarzy przez AI do inteligentnej kompozycji.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Przetwarzanie:** Asynchroniczne (zwraca 202, odpytuj `/api/v1/jobs/{jobId}/progress` o status przez SSE)

**Pakiet modeli:** `face-detection` (200-300 MB) - wymagany tylko dla trybu `face`

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| mode | string | Nie | `"subject"` | Tryb kadrowania: `subject`, `face`, `trim`. (Starsze wartości `attention` i `content` są mapowane na `subject` i `trim`) |
| strategy | string | Nie | `"attention"` | Strategia dla trybu obiektu: `attention` lub `entropy` |
| width | integer | Nie | - | Docelowa szerokość w pikselach |
| height | integer | Nie | - | Docelowa wysokość w pikselach |
| padding | integer | Nie | `0` | Procent marginesu wokół obiektu (0-50) |
| facePreset | string | Nie | `"head-shoulders"` | Ustawienie kadrowania twarzy: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Nie | `0.5` | Czułość wykrywania twarzy (0-1) |
| threshold | integer | Nie | `30` | Próg trybu przycinania dla wykrywania tła (0-255) |
| padToSquare | boolean | Nie | `false` | Uzupełnij przycięty wynik do kwadratu |
| padColor | string | Nie | `"#ffffff"` | Kolor tła dla uzupełnienia |
| targetSize | integer | Nie | - | Docelowy rozmiar uzupełnionego wyniku (piksele) |
| quality | integer | Nie | - | Jakość wyjściowa (1-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
```

## Odpowiedź {#response}

### Wstępna odpowiedź (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Postęp (SSE pod `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","percent":50}
```

### Wynik końcowy (przez SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Tryby {#modes}

### Tryb obiektu {#subject-mode}
Wykorzystuje strategię uwagi lub entropii Sharp, aby znaleźć najbardziej interesujący wizualnie obszar i kadruje wokół niego.

### Tryb twarzy {#face-mode}
Wykrywa twarze za pomocą AI, a następnie komponuje kadr wokół wykrytych twarzy przy użyciu określonego `facePreset`. Wraca do trybu obiektu (strategia uwagi), jeśli nie wykryto żadnych twarzy.

### Tryb przycinania {#trim-mode}
Usuwa jednolite obramowania/tło z obrazu. Opcjonalnie uzupełnia wynik do kwadratu o określonym kolorze tła i rozmiarze docelowym.

## Uwagi {#notes}

- To narzędzie używa fabryki `createToolRoute` z `executionHint: "long"`, więc zwraca 202 z postępem przez SSE.
- Tryb twarzy wymaga pakietu modeli `face-detection` (200-300 MB).
- Tryby obiektu i przycinania działają bez żadnego pakietu modeli AI.
- `facePreset` określa, jak ciasno kadr obejmuje wykryte twarze: `closeup` jest najciaśniejszy, a `half-body` najszerszy.
- Jeśli nie określono szerokości/wysokości, domyślnie przyjmuje 1080x1080.
