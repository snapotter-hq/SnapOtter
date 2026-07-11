---
description: "Wende einen Verpixelungseffekt auf das gesamte Bild oder einen bestimmten Bereich an."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 5ad97ca152ba
---

# Verpixeln {#pixelate}

Wende einen Verpixelungseffekt auf ein gesamtes Bild oder einen bestimmten rechteckigen Bereich an. Nützlich, um sensible Inhalte wie Gesichter, Kennzeichen oder persönliche Informationen unkenntlich zu machen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Nein | `12` | Größe der Pixelblöcke (2-128); größere Werte erzeugen eine gröbere Verpixelung |
| region | object | Nein | - | Verpixelung auf ein Rechteck beschränken (siehe unten) |

### Region-Objekt {#region-object}

| Feld | Typ | Erforderlich | Beschreibung |
|-------|------|----------|-------------|
| left | integer | Ja | Linker Versatz in Pixeln (>= 0) |
| top | integer | Ja | Oberer Versatz in Pixeln (>= 0) |
| width | integer | Ja | Breite des Bereichs in Pixeln (>= 1) |
| height | integer | Ja | Höhe des Bereichs in Pixeln (>= 1) |

## Beispielanfrage {#example-request}

Das gesamte Bild verpixeln:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Einen bestimmten Bereich verpixeln:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Hinweise {#notes}

- Wenn `region` weggelassen wird, wird das gesamte Bild verpixelt.
- Die Koordinaten des Bereichs sind in Pixeln relativ zur oberen linken Ecke des Bildes angegeben. Der Bereich muss innerhalb der Bildgrenzen liegen.
- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
