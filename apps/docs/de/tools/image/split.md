---
description: "Ein Bild nach Zeilen und Spalten oder nach Pixelgröße in Rasterkacheln aufteilen, ausgegeben als ZIP-Archiv."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: b8740b8935b1
---

# Bild aufteilen {#image-splitting}

Teilt ein einzelnes Bild nach Spalten-/Zeilenanzahl oder nach bestimmten Pixelmaßen in Rasterkacheln auf. Gibt ein ZIP-Archiv mit allen Kacheln zurück.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| columns | integer | Nein | 3 | Anzahl der Spalten, in die aufgeteilt wird (1 bis 100) |
| rows | integer | Nein | 3 | Anzahl der Zeilen, in die aufgeteilt wird (1 bis 100) |
| tileWidth | integer | Nein | - | Kachelbreite in Pixeln (min. 10). Überschreibt `columns`, wenn sowohl `tileWidth` als auch `tileHeight` gesetzt sind. |
| tileHeight | integer | Nein | - | Kachelhöhe in Pixeln (min. 10). Überschreibt `rows`, wenn sowohl `tileWidth` als auch `tileHeight` gesetzt sind. |
| outputFormat | string | Nein | `"original"` | Ausgabeformat für Kacheln: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Nein | 90 | Ausgabequalität für verlustbehaftete Formate (1 bis 100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Beispielantwort {#example-response}

Die Antwort wird direkt als ZIP-Datei mit `Content-Type: application/zip` gestreamt. Der Dateiname folgt dem Muster `split-<jobId>.zip`.

Jede Kachel innerhalb des ZIP-Archivs wird nach dem Schema `<originalBaseName>_r<row>_c<col>.<ext>` benannt (z. B. `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Hinweise {#notes}

- Nimmt eine einzelne Bilddatei entgegen.
- Unterstützt HEIC-, RAW-, PSD- und SVG-Eingabeformate (automatisch dekodiert).
- Wenn sowohl `tileWidth` als auch `tileHeight` angegeben sind, haben sie Vorrang vor `columns`/`rows`. Die Rasterabmessungen werden als `ceil(imageWidth / tileWidth)` und `ceil(imageHeight / tileHeight)` berechnet.
- Randkacheln (rechte Spalte, untere Zeile) können kleiner als die angegebene Kachelgröße sein, wenn die Bildabmessungen nicht gleichmäßig teilbar sind.
- Die maximale Rastergröße ist auf 100x100 (10.000 Kacheln) begrenzt.
- Die Antwort streamt das ZIP direkt, es gibt also keinen JSON-Antworttext. Verwenden Sie `--output` mit curl, um die Datei zu speichern.
