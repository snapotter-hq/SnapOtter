---
description: "Redukcja drgań kamery za pomocą dwuprzebiegowej stabilizacji."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 348feb9cfae4
---

# Stabilize Video {#stabilize-video}

Redukuje drgania kamery w nagraniach z ręki przy użyciu dwuprzebiegowej stabilizacji vidstab FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`. To jest endpoint asynchroniczny - zwraca `202 Accepted` natychmiast, a postęp jest przesyłany strumieniowo przez SSE pod `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| smoothing | integer | Nie | `15` | Rozmiar okna wygładzania w klatkach (5-60). Wyższe wartości dają płynniejszy ruch |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Stabilizacja to proces dwuprzebiegowy: pierwszy przebieg analizuje ruch kamery, a drugi przebieg stosuje korekcję. Trwa to około dwa razy dłużej niż w przypadku narzędzi jednoprzebiegowych.
- Wyższe wartości wygładzania usuwają więcej drgań, ale mogą wprowadzić lekkie przycięcie powiększenia przy krawędziach.
- Aktualizacje postępu są dostępne przez SSE pod `GET /api/v1/jobs/{jobId}/progress` aż do zakończenia zadania.
