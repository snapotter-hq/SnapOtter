---
description: "Bilder mit adaptiven, Unschärfemaskierungs- oder Hochpass-Verfahren schärfen, optional mit Rauschreduzierung."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: 0d7818436c69
---

# Schärfen {#sharpening}

Erweitertes Schärfungswerkzeug mit drei Verfahren: adaptiv (intelligent kantenbewusst), Unschärfemaskierung (klassisch mit Radius/Stärke) und Hochpass (Texturbetonung). Enthält eine integrierte Rauschreduzierung, um Schärfungsartefakte zu vermeiden.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| method | string | Nein | `"adaptive"` | Schärfungsalgorithmus: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | Nein | `1.0` | Adaptiv: Gauß-Sigma (0,5 bis 10) |
| m1 | number | Nein | `1.0` | Adaptiv: Schärfung in flachen Bereichen (0 bis 10) |
| m2 | number | Nein | `3.0` | Adaptiv: Schärfung in zerklüfteten Bereichen (0 bis 20) |
| x1 | number | Nein | `2.0` | Adaptiv: Schwellenwert flach/zerklüftet (0 bis 10) |
| y2 | number | Nein | `12` | Adaptiv: maximale Schärfung in flachen Bereichen (0 bis 50) |
| y3 | number | Nein | `20` | Adaptiv: maximale Schärfung in zerklüfteten Bereichen (0 bis 50) |
| amount | number | Nein | `100` | Unschärfemaskierung: Schärfungsstärke (0 bis 1000) |
| radius | number | Nein | `1.0` | Unschärfemaskierung: Weichzeichnungsradius in Pixeln (0,1 bis 5) |
| threshold | number | Nein | `0` | Unschärfemaskierung: minimaler Helligkeitsunterschied zum Schärfen (0 bis 255) |
| strength | number | Nein | `50` | Hochpass: Filterstärke (0 bis 100) |
| kernelSize | number | Nein | `3` | Hochpass: Größe des Faltungskerns (3 oder 5) |
| denoise | string | Nein | `"off"` | Rauschreduzierung vor dem Schärfen: `off`, `light`, `medium`, `strong` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Unschärfemaskierung mit Schwellenwert, um glatte Bereiche zu schützen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Hinweise {#notes}

- Es werden nur die für das gewählte Verfahren relevanten Parameter verwendet. Beispielsweise werden `amount`, `radius` und `threshold` ignoriert, wenn `method` den Wert `adaptive` hat.
- Das adaptive Verfahren nutzt die integrierte adaptive Schärfung von Sharp mit konfigurierbarem Verhalten für flache/zerklüftete Regionen.
- Die Option `denoise` wendet vor dem Schärfen eine Rauschreduzierung an, um eine Verstärkung von Rauschen/Körnung zu verhindern.
- Die Hochpass-Schärfung extrahiert feine Details, indem eine weichgezeichnete Version vom Original subtrahiert und anschließend wieder eingemischt wird.
- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
