---
description: "Riferimento delle operazioni del motore delle immagini. Tutte le operazioni di elaborazione delle immagini basate su Sharp e i loro parametri."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 864b5292c45c
---

# Motore delle immagini {#image-engine}

Il pacchetto `@snapotter/image-engine` gestisce tutte le operazioni sulle immagini non basate sull'AI. Fa da wrapper a [Sharp](https://sharp.pixelplumbing.com/) e viene eseguito interamente in-process senza dipendenze esterne.

## Operazioni {#operations}

### resize {#resize}

Scala un'immagine a dimensioni specifiche o in percentuale.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `width` | number | Larghezza target in pixel |
| `height` | number | Altezza target in pixel |
| `fit` | string | `cover`, `contain`, `fill`, `inside` o `outside` |
| `withoutEnlargement` | boolean | Se true, non ingrandisce le immagini più piccole |
| `percentage` | number | Scala in percentuale invece che con dimensioni assolute |

Puoi impostare `width`, `height` o entrambi. Se ne imposti solo uno, l'altro viene calcolato per mantenere le proporzioni.

### crop {#crop}

Ritaglia una regione rettangolare dall'immagine.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `left` | number | Scostamento X dal bordo sinistro |
| `top` | number | Scostamento Y dal bordo superiore |
| `width` | number | Larghezza dell'area di ritaglio |
| `height` | number | Altezza dell'area di ritaglio |
| `unit` | string | `px` (predefinito) o `percent` |

### rotate {#rotate}

Ruota l'immagine di un dato angolo.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `angle` | number | Angolo di rotazione in gradi (0-360) |
| `background` | string | Colore di riempimento per l'area esposta (predefinito: `#000000`). Si applica solo agli angoli diversi da 90 gradi. |

### flip {#flip}

Specchia l'immagine orizzontalmente, verticalmente o entrambi. Almeno uno deve essere true.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `horizontal` | boolean | Specchia da sinistra a destra |
| `vertical` | boolean | Specchia dall'alto in basso |

### convert {#convert}

Cambia il formato dell'immagine.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `format` | string | Formato target: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Qualità di compressione (1-100, si applica ai formati con perdita) |

I primi sette formati (da `jpg` a `jxl`) vengono codificati da Sharp in-process. I formati rimanenti usano encoder esterni a livello di API: `heic`/`heif` tramite heif-enc, `bmp`/`ico` tramite ImageMagick, `jp2` tramite opj_compress e `qoi` tramite un codec TypeScript inline.

### compress {#compress}

Riduce la dimensione del file mantenendo lo stesso formato.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `quality` | number | Qualità target (1-100) |
| `targetSizeBytes` | number | Dimensione target opzionale del file in byte |
| `format` | string | Override opzionale del formato |

### strip-metadata {#strip-metadata}

Rimuove i metadati EXIF, IPTC, XMP e ICC dall'immagine. Senza parametri (o `stripAll: true`), rimuove tutto. Passa singoli flag per una rimozione selettiva.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `stripAll` | boolean | Rimuove tutti i metadati (predefinito quando nessun flag è impostato) |
| `stripExif` | boolean | Rimuove i dati EXIF (incluso il GPS se `stripGps` non è impostato separatamente) |
| `stripGps` | boolean | Rimuove i dati di posizione GPS |
| `stripIcc` | boolean | Rimuove il profilo colore ICC |
| `stripXmp` | boolean | Rimuove i metadati XMP |

### Regolazioni del colore {#color-adjustments}

Queste operazioni modificano le proprietà cromatiche di un'immagine. Ognuna accetta un singolo valore numerico.

| Operazione | Parametro | Intervallo | Descrizione |
|---|---|---|---|
| `brightness` | `value` | da -100 a 100 | Regola la luminosità |
| `contrast` | `value` | da -100 a 100 | Regola il contrasto |
| `saturation` | `value` | da -100 a 100 | Regola la saturazione del colore |

### Filtri del colore {#color-filters}

Questi applicano una trasformazione cromatica fissa. Non accettano parametri.

| Operazione | Descrizione |
|---|---|
| `grayscale` | Converte in scala di grigi |
| `sepia` | Applica una tonalità seppia |
| `invert` | Inverte tutti i colori |

### Canali del colore {#color-channels}

Regola i singoli canali di colore RGB. I valori sono moltiplicatori dove 100 = nessuna modifica.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `red` | number | Moltiplicatore del canale rosso (da 0 a 200, 100 = invariato) |
| `green` | number | Moltiplicatore del canale verde (da 0 a 200, 100 = invariato) |
| `blue` | number | Moltiplicatore del canale blu (da 0 a 200, 100 = invariato) |

### sharpen {#sharpen}

Nitidezza semplice controllata da un singolo valore.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `value` | number | Intensità della nitidezza (da 0 a 100). Mappata su un sigma gaussiano di 0,5-10. |

### sharpen-advanced {#sharpen-advanced}

Nitidezza avanzata con tre metodi selezionabili e un pre-passaggio opzionale di riduzione del rumore.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` o `high-pass` |
| `sigma` | number | Raggio della sfocatura gaussiana, 0,5-10 (adattivo) |
| `m1` | number | Nitidezza delle aree piatte, 0-10 (adattivo) |
| `m2` | number | Nitidezza delle aree con texture, 0-20 (adattivo) |
| `x1` | number | Soglia piatto/frastagliato, 0-10 (adattivo) |
| `y2` | number | Schiaritura massima (clamp degli aloni), 0-50 (adattivo) |
| `y3` | number | Scurimento massimo (clamp degli aloni), 0-50 (adattivo) |
| `amount` | number | Percentuale di intensità, 0-500 (unsharp-mask) |
| `radius` | number | Raggio della sfocatura, 0,1-5,0 (unsharp-mask) |
| `threshold` | number | Luminosità minima dei bordi, 0-255 (unsharp-mask) |
| `strength` | number | Intensità della fusione, 0-100 (high-pass) |
| `kernelSize` | number | `3` o `5` per kernel 3x3 / 5x5 (high-pass) |
| `denoise` | string | Pre-passaggio di riduzione del rumore: `off`, `light`, `medium` o `strong` |

I parametri sono specifici per il metodo. Fornisci solo quelli pertinenti al metodo scelto.

### color-blindness {#color-blindness}

Simula un deficit della visione dei colori usando una matrice di ricombinazione cromatica 3x3.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `type` | string | Uno tra: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Scrive o rimuove singoli campi di metadati EXIF/IPTC senza rimuovere l'intero blocco.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `artist` | string | Tag EXIF Artist |
| `copyright` | string | Tag EXIF Copyright |
| `imageDescription` | string | Tag EXIF ImageDescription |
| `software` | string | Tag EXIF Software |
| `dateTime` | string | Tag EXIF DateTime |
| `dateTimeOriginal` | string | Tag EXIF DateTimeOriginal |
| `clearGps` | boolean | Rimuove tutti i tag GPS |
| `fieldsToRemove` | string[] | Elenco dei nomi dei campi EXIF da eliminare |

Tutti i parametri sono opzionali. I campi elencati in `fieldsToRemove` vengono eliminati dal blocco EXIF esistente. I campi impostati tramite i parametri nominati vengono scritti (o sovrascritti). Le chiavi binarie/non sicure come MakerNote vengono ignorate silenziosamente.

## Rilevamento del formato {#format-detection}

Il motore rileva automaticamente i formati di input dalle intestazioni dei file, non solo dalle estensioni. Questo significa che un file `.jpg` che in realtà è un PNG verrà gestito correttamente. Il rilevamento usa un approccio multi-livello: prima i magic byte, poi l'estensione del file come fallback.

SnapOtter supporta **oltre 55 formati di input** e **13 formati di output**, inclusi 23 formati RAW da fotocamera di oltre 20 marchi, formati professionali (PSD, EPS, OpenEXR, HDR), codec moderni (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) e formati scientifici/di gioco (FITS, DDS). La decodifica è gestita nativamente da Sharp dove possibile, con fallback automatico a ImageMagick, LibRaw e decoder CLI specializzati.

Vedi la pagina [Formati supportati](/it/guide/supported-formats) per l'elenco completo.

## Estrazione dei metadati {#metadata-extraction}

Lo strumento `info` restituisce i metadati dell'immagine. Vedi [Informazioni sull'immagine](/it/tools/image/info) per il riferimento completo dei campi.

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
