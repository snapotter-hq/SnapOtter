---
description: "Referens för bildmotorns operationer. Alla Sharp-baserade bildbehandlingsoperationer och deras parametrar."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 5b940c0b5573
---

# Bildmotor {#image-engine}

Paketet `@snapotter/image-engine` hanterar alla bildoperationer som inte är AI-baserade. Det omsluter [Sharp](https://sharp.pixelplumbing.com/) och körs helt i processen utan externa beroenden.

## Operationer {#operations}

### resize {#resize}

Skala en bild till specifika dimensioner eller med procentandel.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `width` | number | Målbredd i pixlar |
| `height` | number | Målhöjd i pixlar |
| `fit` | string | `cover`, `contain`, `fill`, `inside` eller `outside` |
| `withoutEnlargement` | boolean | Om sant kommer mindre bilder inte att skalas upp |
| `percentage` | number | Skala med procentandel i stället för absoluta dimensioner |

Du kan ange `width`, `height` eller båda. Om du bara anger den ena beräknas den andra för att bibehålla bildförhållandet.

### crop {#crop}

Klipp ut ett rektangulärt område från bilden.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `left` | number | X-förskjutning från vänsterkanten |
| `top` | number | Y-förskjutning från överkanten |
| `width` | number | Bredd på beskärningsområdet |
| `height` | number | Höjd på beskärningsområdet |
| `unit` | string | `px` (standard) eller `percent` |

### rotate {#rotate}

Rotera bilden med en angiven vinkel.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `angle` | number | Rotationsvinkel i grader (0-360) |
| `background` | string | Fyllnadsfärg för exponerat område (standard: `#000000`). Gäller endast vinklar som inte är 90 grader. |

### flip {#flip}

Spegla bilden horisontellt, vertikalt eller båda. Minst en måste vara sann.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `horizontal` | boolean | Spegla från vänster till höger |
| `vertical` | boolean | Spegla från topp till botten |

### convert {#convert}

Ändra bildformatet.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `format` | string | Målformat: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Komprimeringskvalitet (1-100, gäller förlustbehäftade format) |

De första sju formaten (`jpg` till och med `jxl`) kodas av Sharp i processen. De återstående formaten använder externa kodare på API-lagret: `heic`/`heif` via heif-enc, `bmp`/`ico` via ImageMagick, `jp2` via opj_compress och `qoi` via en inbäddad TypeScript-codec.

### compress {#compress}

Minska filstorleken samtidigt som samma format behålls.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `quality` | number | Målkvalitet (1-100) |
| `targetSizeBytes` | number | Valfri målfilstorlek i byte |
| `format` | string | Valfri åsidosättning av format |

### strip-metadata {#strip-metadata}

Ta bort EXIF-, IPTC-, XMP- och ICC-metadata från bilden. Utan parametrar (eller `stripAll: true`) tas allt bort. Skicka enskilda flaggor för selektiv borttagning.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `stripAll` | boolean | Ta bort all metadata (standard när inga flaggor är satta) |
| `stripExif` | boolean | Ta bort EXIF-data (inklusive GPS om `stripGps` inte är separat satt) |
| `stripGps` | boolean | Ta bort GPS-platsdata |
| `stripIcc` | boolean | Ta bort ICC-färgprofil |
| `stripXmp` | boolean | Ta bort XMP-metadata |

### Färgjusteringar {#color-adjustments}

Dessa operationer ändrar en bilds färgegenskaper. Var och en tar ett enda numeriskt värde.

| Operation | Parameter | Intervall | Beskrivning |
|---|---|---|---|
| `brightness` | `value` | -100 till 100 | Justera ljusstyrka |
| `contrast` | `value` | -100 till 100 | Justera kontrast |
| `saturation` | `value` | -100 till 100 | Justera färgmättnad |

### Färgfilter {#color-filters}

Dessa tillämpar en fast färgtransformation. De tar inga parametrar.

| Operation | Beskrivning |
|---|---|
| `grayscale` | Konvertera till gråskala |
| `sepia` | Tillämpa en sepiaton |
| `invert` | Invertera alla färger |

### Färgkanaler {#color-channels}

Justera enskilda RGB-färgkanaler. Värden är multiplikatorer där 100 = ingen förändring.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `red` | number | Multiplikator för röd kanal (0 till 200, 100 = oförändrad) |
| `green` | number | Multiplikator för grön kanal (0 till 200, 100 = oförändrad) |
| `blue` | number | Multiplikator för blå kanal (0 till 200, 100 = oförändrad) |

### sharpen {#sharpen}

Enkel skärpning som styrs av ett enda värde.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `value` | number | Skärpningsintensitet (0 till 100). Mappas till ett gaussiskt sigma på 0,5-10. |

### sharpen-advanced {#sharpen-advanced}

Avancerad skärpning med tre valbara metoder och ett valfritt förpass för brusreducering.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` eller `high-pass` |
| `sigma` | number | Radie för gaussisk oskärpa, 0,5-10 (adaptiv) |
| `m1` | number | Skärpning av jämna ytor, 0-10 (adaptiv) |
| `m2` | number | Skärpning av texturerade ytor, 0-20 (adaptiv) |
| `x1` | number | Tröskel för jämnt/ojämnt, 0-10 (adaptiv) |
| `y2` | number | Max upplysning (halobegränsning), 0-50 (adaptiv) |
| `y3` | number | Max nedmörkning (halobegränsning), 0-50 (adaptiv) |
| `amount` | number | Intensitetsprocent, 0-500 (unsharp-mask) |
| `radius` | number | Oskärperadie, 0,1-5,0 (unsharp-mask) |
| `threshold` | number | Minsta kantljusstyrka, 0-255 (unsharp-mask) |
| `strength` | number | Blandningsstyrka, 0-100 (high-pass) |
| `kernelSize` | number | `3` eller `5` för 3x3-/5x5-kärna (high-pass) |
| `denoise` | string | Förpass för brusreducering: `off`, `light`, `medium` eller `strong` |

Parametrarna är metodspecifika. Ange endast de som är relevanta för den valda metoden.

### color-blindness {#color-blindness}

Simulera en färgseendedefekt med hjälp av en 3x3-matris för färgrekombination.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `type` | string | En av: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Skriv eller ta bort enskilda EXIF-/IPTC-metadatafält utan att ta bort hela blocket.

| Parameter | Typ | Beskrivning |
|---|---|---|
| `artist` | string | EXIF Artist-tagg |
| `copyright` | string | EXIF Copyright-tagg |
| `imageDescription` | string | EXIF ImageDescription-tagg |
| `software` | string | EXIF Software-tagg |
| `dateTime` | string | EXIF DateTime-tagg |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal-tagg |
| `clearGps` | boolean | Ta bort alla GPS-taggar |
| `fieldsToRemove` | string[] | Lista över EXIF-fältnamn att radera |

Alla parametrar är valfria. Fält som listas i `fieldsToRemove` raderas från det befintliga EXIF-blocket. Fält som anges via de namngivna parametrarna skrivs (eller skrivs över). Binära/osäkra nycklar som MakerNote ignoreras tyst.

## Formatidentifiering {#format-detection}

Motorn identifierar automatiskt indataformat från filhuvuden, inte bara från filändelser. Det innebär att en `.jpg`-fil som egentligen är en PNG hanteras korrekt. Identifieringen använder en flerlagersansats: magiska byte först, sedan filändelse som reserv.

SnapOtter stöder **55+ indataformat** och **13 utdataformat**, inklusive 23 kamera-RAW-format från 20+ märken, professionella format (PSD, EPS, OpenEXR, HDR), moderna codecs (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) och vetenskapliga/spelrelaterade format (FITS, DDS). Avkodning hanteras nativt av Sharp där det är möjligt, med automatisk reserv till ImageMagick, LibRaw och specialiserade CLI-avkodare.

Se sidan [Format som stöds](/sv/guide/supported-formats) för den fullständiga listan.

## Metadatautvinning {#metadata-extraction}

Verktyget `info` returnerar bildmetadata. Se [Bildinfo](/sv/tools/image/info) för den fullständiga fältreferensen.

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
