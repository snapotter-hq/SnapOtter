---
description: "SVG-Dateien mit svgo minimieren und das Ergebnis als Vektor-SVG behalten, mit Steuerung für Genauigkeit, Mehrfachdurchläufe, Metadaten und Formatierung."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 64caa7bee14a
i18n_hash_version: 2
---

# SVG optimieren {#optimize-svg}

Verkleinere SVG-Dateien, indem Editor-Altlasten, überflüssige Attribute und zu viele Dezimalstellen entfernt werden, und lade das Ergebnis als SVG herunter. Anders als bei „Für Web optimieren“ wird die Ausgabe nie gerastert.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Akzeptiert Multipart-Formulardaten mit einer `.svg`- oder `.svgz`-Datei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| precision | number | Nein | `3` | Dezimalstellen, die in Pfaddaten und Zahlen erhalten bleiben (0 bis 8). Niedrigere Werte ergeben kleinere Dateien und etwas gröbere Kurven. |
| multipass | boolean | Nein | `true` | Den Optimierer wiederholt ausführen, bis die Ausgabe nicht mehr schrumpft |
| removeMetadata | boolean | Nein | `true` | Kommentare, `<metadata>`, `<desc>` und editorspezifische Daten entfernen. Ausschalten, um sie zu behalten. |
| pretty | boolean | Nein | `false` | Die Ausgabe zur besseren Lesbarkeit einrücken, statt sie auf wenige Zeilen zu minimieren |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Hinweise {#notes}

- Die Eingabe muss eine SVG- oder SVGZ-Datei sein. Ein Rasterbild wird mit `400` und dem Code `IMAGE_UNDECODABLE` abgelehnt.
- `.svgz`-Eingaben werden zuerst entpackt, und die Ausgabe ist immer eine einfache `.svg`-Datei.
- Das SVG ist nach dem Entpacken auf 2 MB begrenzt. Eine größere Datei wird mit `400` und dem Code `SVG_TOO_LARGE` abgelehnt.
- `viewBox` und `<title>` bleiben immer erhalten, damit die Grafik weiterhin skaliert und ihren barrierefreien Namen behält.
- Eingabe und Ausgabe durchlaufen beide den SVG-Sanitizer, der Skripte und andere aktive Inhalte entfernt.
- Eine niedrigere `precision` spart bei pfadlastigen Grafiken am meisten Platz. Prüfe das Ergebnis bei 0 bis 2 visuell.
