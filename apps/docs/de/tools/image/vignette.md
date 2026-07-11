---
description: "Einen Vignetteneffekt mit einstellbarer Stärke, Farbe und Position hinzufügen."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 43953b932234
---

# Vignette {#vignette}

Fügt einen Vignetteneffekt hinzu, der die Ränder eines Bildes abdunkelt oder einfärbt. Unterstützt einstellbare Stärke, Farbe, Radius, Weichheit, Rundheit und Mittelpunktposition.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| strength | number | Nein | `0.5` | Deckkraft der Vignette (0,1-1) |
| color | string | Nein | `"#000000"` | Hex-Farbe der Vignette |
| radius | integer | Nein | `70` | Außenradius als Prozentsatz der halben Diagonale (0-100) |
| softness | integer | Nein | `50` | Weichheit der Übergangskante (0-100); höhere Werte erzeugen einen graduelleren Verlauf |
| roundness | integer | Nein | `100` | Form: 100 = Kreis, 0 = Ellipse passend zum Seitenverhältnis des Bildes |
| centerX | integer | Nein | `50` | Horizontale Mittelpunktposition als Prozentsatz (0-100) |
| centerY | integer | Nein | `50` | Vertikale Mittelpunktposition als Prozentsatz (0-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Hinweise {#notes}

- Ein kleinerer `radius` dunkelt einen größeren Teil des Bildes ab; ein größerer Radius beschränkt die Vignette auf die äußersten Ränder.
- Verwenden Sie eine nicht-schwarze `color` (z. B. Weiß- oder Sepiatöne) für kreative Vignetteneffekte.
- Durch das Anpassen von `centerX` und `centerY` können Sie den klaren Bereich außermittig positionieren, was nützlich ist, um den Fokus auf ein Motiv zu lenken, das sich nicht in der Bildmitte befindet.
- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
