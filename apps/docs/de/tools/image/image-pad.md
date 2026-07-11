---
description: "Füllt ein Bild auf ein Zielseitenverhältnis mit einer Volltonfarbe, transparentem oder unscharfem Hintergrund auf."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: b15bb1ba9e66
---

# Bild auffüllen {#image-pad}

Füllt ein Bild auf ein Zielseitenverhältnis auf, indem ein Hintergrund aus einer Volltonfarbe, transparent oder unscharf darum herum hinzugefügt wird. Nützlich, um Bilder ohne Zuschneiden in feste Seitenverhältnisse für soziale Medien oder den Druck einzupassen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| target | string | Nein | `"1:1"` | Zielseitenverhältnis: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` oder `custom` |
| ratioW | integer | Nein | `1` | Benutzerdefinierte Verhältnisbreite (1-100, verwendet, wenn target `custom` ist) |
| ratioH | integer | Nein | `1` | Benutzerdefinierte Verhältnishöhe (1-100, verwendet, wenn target `custom` ist) |
| background | string | Nein | `"color"` | Hintergrundmodus: `color`, `transparent` oder `blur` |
| color | string | Nein | `"#ffffff"` | Hintergrund-Hexfarbe (wenn background `color` ist) |
| padding | integer | Nein | `0` | Zusätzlicher Innenabstand als Prozentsatz der Leinwand (0-50) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Hinweise {#notes}

- Der Hintergrundmodus `blur` erzeugt eine unscharfe Kopie des Originalbilds als Füllung, was ein visuell stimmiges Ergebnis liefert.
- Bei Verwendung des Hintergrunds `transparent` wird die Ausgabe in PNG umgewandelt, um den Alphakanal zu erhalten.
- Das Ausgabeformat entspricht dem Eingabeformat, es sei denn, Transparenz ist beteiligt. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch decodiert.
- Setzen Sie `target` auf `custom` und geben Sie `ratioW` und `ratioH` für beliebige Seitenverhältnisse an (z. B. `ratioW: 3, ratioH: 2` für 3:2).
