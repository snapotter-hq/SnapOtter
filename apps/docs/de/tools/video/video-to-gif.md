---
description: "Einen Videoclip in ein animiertes GIF verwandeln."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 8de2f0e20107
---

# Video to GIF {#video-to-gif}

Einen Videoclip in ein animiertes GIF mit konfigurierbarer Bildrate, Breite, Startzeit und Dauer verwandeln.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen. Dies ist ein asynchroner Endpunkt: Er gibt sofort `202 Accepted` zurück, und der Fortschritt wird per SSE unter `GET /api/v1/jobs/{jobId}/progress` gestreamt.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Ausgabe-Bildrate (1-30) |
| width | integer | No | `480` | Ausgabebreite in Pixeln (64-1280). Die Höhe skaliert proportional |
| startS | number | No | `0` | Startzeit in Sekunden (muss >= 0 sein) |
| durationS | number | No | `5` | Dauer in Sekunden (über 0, max. 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Niedrigere Werte für `fps` und `width` erzeugen kleinere GIF-Dateien. Ein 480px breites GIF mit 12 fps ist meist ein guter Kompromiss.
- Die maximale Dauer beträgt 60 Sekunden. Längere Clips erzeugen sehr große Dateien.
- Fortschrittsaktualisierungen sind per SSE unter `GET /api/v1/jobs/{jobId}/progress` verfügbar, bis der Job abgeschlossen ist.
