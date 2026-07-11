---
description: "Referenz zu den Operationen der Image-Engine. Alle Sharp-basierten Bildverarbeitungsoperationen und ihre Parameter."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 360d6021118d
---

# Image-Engine {#image-engine}

Das `@snapotter/image-engine`-Paket übernimmt alle Bildoperationen ohne KI. Es kapselt [Sharp](https://sharp.pixelplumbing.com/) und läuft vollständig im Prozess ohne externe Abhängigkeiten.

## Operationen {#operations}

### resize {#resize}

Ein Bild auf bestimmte Abmessungen oder um einen Prozentsatz skalieren.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `width` | number | Zielbreite in Pixeln |
| `height` | number | Zielhöhe in Pixeln |
| `fit` | string | `cover`, `contain`, `fill`, `inside` oder `outside` |
| `withoutEnlargement` | boolean | Wenn true, werden kleinere Bilder nicht hochskaliert |
| `percentage` | number | Statt absoluter Abmessungen um einen Prozentsatz skalieren |

Du kannst `width`, `height` oder beides festlegen. Wenn du nur einen Wert festlegst, wird der andere berechnet, um das Seitenverhältnis beizubehalten.

### crop {#crop}

Einen rechteckigen Bereich aus dem Bild ausschneiden.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `left` | number | X-Versatz vom linken Rand |
| `top` | number | Y-Versatz vom oberen Rand |
| `width` | number | Breite des Zuschnittbereichs |
| `height` | number | Höhe des Zuschnittbereichs |
| `unit` | string | `px` (Standard) oder `percent` |

### rotate {#rotate}

Das Bild um einen bestimmten Winkel drehen.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `angle` | number | Drehwinkel in Grad (0-360) |
| `background` | string | Füllfarbe für den freigelegten Bereich (Standard: `#000000`). Gilt nur für Winkel, die kein Vielfaches von 90 Grad sind. |

### flip {#flip}

Das Bild horizontal, vertikal oder in beide Richtungen spiegeln. Mindestens einer der Werte muss true sein.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `horizontal` | boolean | Von links nach rechts spiegeln |
| `vertical` | boolean | Von oben nach unten spiegeln |

### convert {#convert}

Das Bildformat ändern.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `format` | string | Zielformat: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Komprimierungsqualität (1-100, gilt für verlustbehaftete Formate) |

Die ersten sieben Formate (`jpg` bis `jxl`) werden von Sharp im Prozess kodiert. Die übrigen Formate verwenden externe Encoder auf der API-Ebene: `heic`/`heif` über heif-enc, `bmp`/`ico` über ImageMagick, `jp2` über opj_compress und `qoi` über einen Inline-TypeScript-Codec.

### compress {#compress}

Die Dateigröße reduzieren und dabei dasselbe Format beibehalten.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `quality` | number | Zielqualität (1-100) |
| `targetSizeBytes` | number | Optionale Zieldateigröße in Bytes |
| `format` | string | Optionale Überschreibung des Formats |

### strip-metadata {#strip-metadata}

EXIF-, IPTC-, XMP- und ICC-Metadaten aus dem Bild entfernen. Ohne Parameter (oder mit `stripAll: true`) wird alles entfernt. Übergib einzelne Flags für ein selektives Entfernen.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `stripAll` | boolean | Alle Metadaten entfernen (Standard, wenn keine Flags gesetzt sind) |
| `stripExif` | boolean | EXIF-Daten entfernen (einschließlich GPS, sofern `stripGps` nicht separat gesetzt ist) |
| `stripGps` | boolean | GPS-Standortdaten entfernen |
| `stripIcc` | boolean | ICC-Farbprofil entfernen |
| `stripXmp` | boolean | XMP-Metadaten entfernen |

### Farbanpassungen {#color-adjustments}

Diese Operationen verändern die Farbeigenschaften eines Bildes. Jede nimmt einen einzelnen numerischen Wert entgegen.

| Operation | Parameter | Bereich | Beschreibung |
|---|---|---|---|
| `brightness` | `value` | -100 bis 100 | Helligkeit anpassen |
| `contrast` | `value` | -100 bis 100 | Kontrast anpassen |
| `saturation` | `value` | -100 bis 100 | Farbsättigung anpassen |

### Farbfilter {#color-filters}

Diese wenden eine feste Farbtransformation an. Sie nehmen keine Parameter entgegen.

| Operation | Beschreibung |
|---|---|
| `grayscale` | In Graustufen umwandeln |
| `sepia` | Einen Sepiaton anwenden |
| `invert` | Alle Farben invertieren |

### Farbkanäle {#color-channels}

Einzelne RGB-Farbkanäle anpassen. Werte sind Multiplikatoren, wobei 100 = keine Änderung bedeutet.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `red` | number | Multiplikator des Rotkanals (0 bis 200, 100 = unverändert) |
| `green` | number | Multiplikator des Grünkanals (0 bis 200, 100 = unverändert) |
| `blue` | number | Multiplikator des Blaukanals (0 bis 200, 100 = unverändert) |

### sharpen {#sharpen}

Einfaches Schärfen, gesteuert durch einen einzelnen Wert.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `value` | number | Schärfungsintensität (0 bis 100). Abgebildet auf ein Gaußsches Sigma von 0,5-10. |

### sharpen-advanced {#sharpen-advanced}

Erweitertes Schärfen mit drei wählbaren Methoden und einem optionalen Rauschunterdrückungs-Vordurchlauf.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` oder `high-pass` |
| `sigma` | number | Radius der Gaußschen Unschärfe, 0,5-10 (adaptiv) |
| `m1` | number | Schärfung in flachen Bereichen, 0-10 (adaptiv) |
| `m2` | number | Schärfung in strukturierten Bereichen, 0-20 (adaptiv) |
| `x1` | number | Schwelle flach/zackig, 0-10 (adaptiv) |
| `y2` | number | Maximale Aufhellung (Halo-Begrenzung), 0-50 (adaptiv) |
| `y3` | number | Maximale Abdunklung (Halo-Begrenzung), 0-50 (adaptiv) |
| `amount` | number | Intensität in Prozent, 0-500 (Unschärfemaske) |
| `radius` | number | Unschärferadius, 0,1-5,0 (Unschärfemaske) |
| `threshold` | number | Minimale Kantenhelligkeit, 0-255 (Unschärfemaske) |
| `strength` | number | Überblendungsstärke, 0-100 (Hochpass) |
| `kernelSize` | number | `3` oder `5` für 3x3- / 5x5-Kernel (Hochpass) |
| `denoise` | string | Rauschunterdrückungs-Vordurchlauf: `off`, `light`, `medium` oder `strong` |

Die Parameter sind methodenspezifisch. Gib nur die für die gewählte Methode relevanten an.

### color-blindness {#color-blindness}

Eine Farbfehlsichtigkeit mithilfe einer 3x3-Farbrekombinationsmatrix simulieren.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `type` | string | Eines von: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Einzelne EXIF-/IPTC-Metadatenfelder schreiben oder entfernen, ohne den gesamten Block zu entfernen.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `artist` | string | EXIF-Tag Artist |
| `copyright` | string | EXIF-Tag Copyright |
| `imageDescription` | string | EXIF-Tag ImageDescription |
| `software` | string | EXIF-Tag Software |
| `dateTime` | string | EXIF-Tag DateTime |
| `dateTimeOriginal` | string | EXIF-Tag DateTimeOriginal |
| `clearGps` | boolean | Alle GPS-Tags entfernen |
| `fieldsToRemove` | string[] | Liste der zu löschenden EXIF-Feldnamen |

Alle Parameter sind optional. In `fieldsToRemove` aufgeführte Felder werden aus dem vorhandenen EXIF-Block gelöscht. Über die benannten Parameter gesetzte Felder werden geschrieben (oder überschrieben). Binäre/unsichere Schlüssel wie MakerNote werden stillschweigend ignoriert.

## Formaterkennung {#format-detection}

Die Engine erkennt Eingabeformate automatisch anhand der Dateiheader, nicht nur anhand der Dateiendungen. Das bedeutet, dass eine `.jpg`-Datei, die in Wirklichkeit ein PNG ist, korrekt verarbeitet wird. Die Erkennung verfolgt einen mehrstufigen Ansatz: zuerst die Magic Bytes, dann die Dateiendung als Fallback.

SnapOtter unterstützt **55+ Eingabeformate** und **13 Ausgabeformate**, darunter 23 Kamera-RAW-Formate von über 20 Marken, professionelle Formate (PSD, EPS, OpenEXR, HDR), moderne Codecs (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) sowie wissenschaftliche/Gaming-Formate (FITS, DDS). Die Dekodierung übernimmt nach Möglichkeit Sharp nativ, mit automatischem Fallback auf ImageMagick, LibRaw und spezialisierte CLI-Decoder.

Die vollständige Liste findest du auf der Seite [Unterstützte Formate](/de/guide/supported-formats).

## Metadatenextraktion {#metadata-extraction}

Das `info`-Tool gibt Bildmetadaten zurück. Die vollständige Feldreferenz findest du unter [Bildinformationen](/de/tools/image/info).

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
