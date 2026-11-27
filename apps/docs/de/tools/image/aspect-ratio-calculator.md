---
description: "Die fehlende Breite oder Höhe berechnen, die ein Seitenverhältnis beibehält, und das Verhältnis kürzen."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 2802c0f7df03
i18n_hash_version: 2
---

# Seitenverhältnis-Rechner {#aspect-ratio-calculator}

Geben Sie die ursprüngliche Breite und Höhe ein, dazu eine neue Breite oder eine neue Höhe, und Sie erhalten die jeweils andere Seite zurück, sodass die Proportionen gleich bleiben. Das Verhältnis kommt in gekürzter Form zurück, aus 1920 × 1080 wird also 16:9. In der Web-App können Sie mit einem gängigen Verhältnis beginnen (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) und zwischen Quer- und Hochformat wechseln.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Nimmt einen JSON-Body entgegen, keine Multipart-Formulardaten, und antwortet mit Zahlen statt mit einer herunterladbaren Datei.

## Parameter {#parameters}

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `width` | number | (erforderlich) | Ursprüngliche Breite. |
| `height` | number | (erforderlich) | Ursprüngliche Höhe. |
| `newWidth` | number | - | Zielbreite. Die Antwort berechnet daraus `newHeight`. |
| `newHeight` | number | - | Zielhöhe. Die Antwort berechnet daraus `newWidth`. |
| `round` | boolean | `true` | Die berechnete Seite auf eine ganze Zahl runden. Bei `false` bleiben zwei Dezimalstellen erhalten. |

Jede Abmessung muss zwischen `0.0001` und `1000000` liegen. Senden Sie `newWidth` oder `newHeight`, nicht beides. Lassen Sie beide weg, um nur das gekürzte Verhältnis zu erhalten.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Beispielantwort {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` und `newHeight` sind `null`, wenn die Anfrage keines von beiden enthielt.

## Hinweise {#notes}

- Gebrochene Größen werden mit bis zu vier Dezimalstellen auf ein ganzzahliges Verhältnis gekürzt, daher kommt `8.5` × `11` als `17:22` zurück.
- `ratioDecimal` ist die Breite geteilt durch die Höhe, auf vier Dezimalstellen gerundet.
- Eine berechnete Seite kommt nie als `0` zurück. Mit Rundung ist sie mindestens `1`, ohne Rundung mindestens `0.01`.
- Wenn Sie `newWidth` und `newHeight` zusammen senden oder eine Abmessung außerhalb des erlaubten Bereichs liegt, kommt ein 400 zurück.
- Der Rechner liest oder schreibt nie eine Datei. Um die Zahlen anzuwenden, nutzen Sie [Bildgröße ändern](/de/tools/image/resize) oder [Bild zuschneiden](/de/tools/image/crop).
