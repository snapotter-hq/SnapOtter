---
description: "Referentie voor bewerkingen van de image-engine. Alle Sharp-gebaseerde afbeeldingsverwerkingsbewerkingen en hun parameters."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 4749742b6fcc
---

# Image-engine {#image-engine}

Het `@snapotter/image-engine` pakket verwerkt alle niet-AI-afbeeldingsbewerkingen. Het omhult [Sharp](https://sharp.pixelplumbing.com/) en draait volledig in-process zonder externe afhankelijkheden.

## Bewerkingen {#operations}

### resize {#resize}

Schaal een afbeelding naar specifieke afmetingen of op percentage.

| Parameter | Type | Beschrijving |
|---|---|---|
| `width` | number | Doelbreedte in pixels |
| `height` | number | Doelhoogte in pixels |
| `fit` | string | `cover`, `contain`, `fill`, `inside` of `outside` |
| `withoutEnlargement` | boolean | Indien true, worden kleinere afbeeldingen niet opgeschaald |
| `percentage` | number | Schaal op percentage in plaats van absolute afmetingen |

Je kunt `width`, `height` of beide instellen. Als je er slechts één instelt, wordt de andere berekend om de beeldverhouding te behouden.

### crop {#crop}

Snijd een rechthoekig gebied uit de afbeelding.

| Parameter | Type | Beschrijving |
|---|---|---|
| `left` | number | X-offset vanaf de linkerrand |
| `top` | number | Y-offset vanaf de bovenrand |
| `width` | number | Breedte van het bijsnijdgebied |
| `height` | number | Hoogte van het bijsnijdgebied |
| `unit` | string | `px` (standaard) of `percent` |

### rotate {#rotate}

Draai de afbeelding over een opgegeven hoek.

| Parameter | Type | Beschrijving |
|---|---|---|
| `angle` | number | Rotatiehoek in graden (0-360) |
| `background` | string | Vulkleur voor blootgesteld gebied (standaard: `#000000`). Alleen van toepassing op hoeken die niet 90 graden zijn. |

### flip {#flip}

Spiegel de afbeelding horizontaal, verticaal of beide. Ten minste één moet true zijn.

| Parameter | Type | Beschrijving |
|---|---|---|
| `horizontal` | boolean | Spiegel van links naar rechts |
| `vertical` | boolean | Spiegel van boven naar beneden |

### convert {#convert}

Wijzig het afbeeldingsformaat.

| Parameter | Type | Beschrijving |
|---|---|---|
| `format` | string | Doelformaat: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Compressiekwaliteit (1-100, van toepassing op lossy-formaten) |

De eerste zeven formaten (`jpg` tot en met `jxl`) worden in-process door Sharp gecodeerd. De overige formaten gebruiken externe encoders op de API-laag: `heic`/`heif` via heif-enc, `bmp`/`ico` via ImageMagick, `jp2` via opj_compress en `qoi` via een inline TypeScript-codec.

### compress {#compress}

Verklein de bestandsgrootte met behoud van hetzelfde formaat.

| Parameter | Type | Beschrijving |
|---|---|---|
| `quality` | number | Doelkwaliteit (1-100) |
| `targetSizeBytes` | number | Optionele doelbestandsgrootte in bytes |
| `format` | string | Optionele format-override |

### strip-metadata {#strip-metadata}

Verwijder EXIF-, IPTC-, XMP- en ICC-metadata uit de afbeelding. Zonder parameters (of `stripAll: true`) wordt alles verwijderd. Geef individuele vlaggen mee voor selectieve verwijdering.

| Parameter | Type | Beschrijving |
|---|---|---|
| `stripAll` | boolean | Alle metadata verwijderen (standaard wanneer geen vlaggen zijn ingesteld) |
| `stripExif` | boolean | EXIF-gegevens verwijderen (inclusief GPS als `stripGps` niet apart is ingesteld) |
| `stripGps` | boolean | GPS-locatiegegevens verwijderen |
| `stripIcc` | boolean | ICC-kleurprofiel verwijderen |
| `stripXmp` | boolean | XMP-metadata verwijderen |

### Kleuraanpassingen {#color-adjustments}

Deze bewerkingen wijzigen de kleureigenschappen van een afbeelding. Elke neemt één numerieke waarde.

| Bewerking | Parameter | Bereik | Beschrijving |
|---|---|---|---|
| `brightness` | `value` | -100 tot 100 | Helderheid aanpassen |
| `contrast` | `value` | -100 tot 100 | Contrast aanpassen |
| `saturation` | `value` | -100 tot 100 | Kleurverzadiging aanpassen |

### Kleurfilters {#color-filters}

Deze passen een vaste kleurtransformatie toe. Ze nemen geen parameters.

| Bewerking | Beschrijving |
|---|---|
| `grayscale` | Omzetten naar grijstinten |
| `sepia` | Een sepiatint toepassen |
| `invert` | Alle kleuren omkeren |

### Kleurkanalen {#color-channels}

Pas individuele RGB-kleurkanalen aan. Waarden zijn vermenigvuldigers waarbij 100 = geen wijziging.

| Parameter | Type | Beschrijving |
|---|---|---|
| `red` | number | Vermenigvuldiger rood kanaal (0 tot 200, 100 = ongewijzigd) |
| `green` | number | Vermenigvuldiger groen kanaal (0 tot 200, 100 = ongewijzigd) |
| `blue` | number | Vermenigvuldiger blauw kanaal (0 tot 200, 100 = ongewijzigd) |

### sharpen {#sharpen}

Eenvoudige verscherping, aangestuurd door één waarde.

| Parameter | Type | Beschrijving |
|---|---|---|
| `value` | number | Verscherpingsintensiteit (0 tot 100). Toegewezen aan een Gaussische sigma van 0,5-10. |

### sharpen-advanced {#sharpen-advanced}

Geavanceerde verscherping met drie selecteerbare methoden en een optionele ruisverminderende voorbewerking.

| Parameter | Type | Beschrijving |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` of `high-pass` |
| `sigma` | number | Straal van Gaussische vervaging, 0,5-10 (adaptief) |
| `m1` | number | Verscherping van vlakke gebieden, 0-10 (adaptief) |
| `m2` | number | Verscherping van getextureerde gebieden, 0-20 (adaptief) |
| `x1` | number | Drempel vlak/gekarteld, 0-10 (adaptief) |
| `y2` | number | Max verheldering (halo-begrenzing), 0-50 (adaptief) |
| `y3` | number | Max verdonkering (halo-begrenzing), 0-50 (adaptief) |
| `amount` | number | Intensiteitspercentage, 0-500 (unsharp-mask) |
| `radius` | number | Straal van vervaging, 0,1-5,0 (unsharp-mask) |
| `threshold` | number | Minimale randhelderheid, 0-255 (unsharp-mask) |
| `strength` | number | Sterkte van menging, 0-100 (high-pass) |
| `kernelSize` | number | `3` of `5` voor 3x3- / 5x5-kernel (high-pass) |
| `denoise` | string | Ruisverminderende voorbewerking: `off`, `light`, `medium` of `strong` |

Parameters zijn methodespecifiek. Geef alleen de parameters mee die relevant zijn voor de gekozen methode.

### color-blindness {#color-blindness}

Simuleer een kleurzienstoornis met een 3x3-kleurhercombinatiematrix.

| Parameter | Type | Beschrijving |
|---|---|---|
| `type` | string | Een van: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Schrijf of verwijder individuele EXIF-/IPTC-metadatavelden zonder het hele blok te verwijderen.

| Parameter | Type | Beschrijving |
|---|---|---|
| `artist` | string | EXIF Artist-tag |
| `copyright` | string | EXIF Copyright-tag |
| `imageDescription` | string | EXIF ImageDescription-tag |
| `software` | string | EXIF Software-tag |
| `dateTime` | string | EXIF DateTime-tag |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal-tag |
| `clearGps` | boolean | Alle GPS-tags verwijderen |
| `fieldsToRemove` | string[] | Lijst met te verwijderen EXIF-veldnamen |

Alle parameters zijn optioneel. Velden die in `fieldsToRemove` worden opgesomd, worden uit het bestaande EXIF-blok verwijderd. Velden die via de benoemde parameters zijn ingesteld, worden geschreven (of overschreven). Binaire/onveilige sleutels zoals MakerNote worden stilzwijgend genegeerd.

## Formaatdetectie {#format-detection}

De engine detecteert invoerformaten automatisch op basis van bestandsheaders, niet alleen op basis van bestandsextensies. Dit betekent dat een `.jpg`-bestand dat eigenlijk een PNG is, correct wordt verwerkt. De detectie gebruikt een meerlaagse aanpak: eerst magic bytes, daarna de bestandsextensie als fallback.

SnapOtter ondersteunt **55+ invoerformaten** en **13 uitvoerformaten**, waaronder 23 camera-RAW-formaten van 20+ merken, professionele formaten (PSD, EPS, OpenEXR, HDR), moderne codecs (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) en wetenschappelijke/gaming-formaten (FITS, DDS). Decodering wordt waar mogelijk native door Sharp afgehandeld, met automatische fallback naar ImageMagick, LibRaw en gespecialiseerde CLI-decoders.

Zie de pagina [Ondersteunde formaten](/nl/guide/supported-formats) voor de volledige lijst.

## Metadata-extractie {#metadata-extraction}

De `info`-tool geeft afbeeldingsmetadata terug. Zie [Afbeeldingsinfo](/nl/tools/image/info) voor de volledige veldreferentie.

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
