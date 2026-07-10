---
description: "Referencia de operaciones del motor de imágenes. Todas las operaciones de procesamiento de imágenes basadas en Sharp y sus parámetros."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: fbd5ae93bf8b
---

# Motor de imágenes {#image-engine}

El paquete `@snapotter/image-engine` gestiona todas las operaciones de imagen que no son de IA. Envuelve [Sharp](https://sharp.pixelplumbing.com/) y se ejecuta por completo en el proceso, sin dependencias externas.

## Operaciones {#operations}

### resize {#resize}

Escala una imagen a dimensiones específicas o por porcentaje.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `width` | number | Ancho objetivo en píxeles |
| `height` | number | Alto objetivo en píxeles |
| `fit` | string | `cover`, `contain`, `fill`, `inside` o `outside` |
| `withoutEnlargement` | boolean | Si es verdadero, no ampliará imágenes más pequeñas |
| `percentage` | number | Escalar por porcentaje en lugar de dimensiones absolutas |

Puedes establecer `width`, `height` o ambos. Si solo estableces uno, el otro se calcula para mantener la relación de aspecto.

### crop {#crop}

Recorta una región rectangular de la imagen.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `left` | number | Desplazamiento X desde el borde izquierdo |
| `top` | number | Desplazamiento Y desde el borde superior |
| `width` | number | Ancho del área de recorte |
| `height` | number | Alto del área de recorte |
| `unit` | string | `px` (por defecto) o `percent` |

### rotate {#rotate}

Rota la imagen un ángulo determinado.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `angle` | number | Ángulo de rotación en grados (0-360) |
| `background` | string | Color de relleno para el área expuesta (por defecto: `#000000`). Solo se aplica a ángulos que no sean de 90 grados. |

### flip {#flip}

Refleja la imagen en horizontal, en vertical o en ambas direcciones. Al menos una debe ser verdadera.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `horizontal` | boolean | Reflejar de izquierda a derecha |
| `vertical` | boolean | Reflejar de arriba a abajo |

### convert {#convert}

Cambia el formato de la imagen.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `format` | string | Formato objetivo: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Calidad de compresión (1-100, se aplica a los formatos con pérdida) |

Los primeros siete formatos (de `jpg` a `jxl`) los codifica Sharp en el proceso. Los formatos restantes usan codificadores externos en la capa de la API: `heic`/`heif` mediante heif-enc, `bmp`/`ico` mediante ImageMagick, `jp2` mediante opj_compress y `qoi` mediante un códec TypeScript en línea.

### compress {#compress}

Reduce el tamaño del archivo manteniendo el mismo formato.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `quality` | number | Calidad objetivo (1-100) |
| `targetSizeBytes` | number | Tamaño de archivo objetivo opcional en bytes |
| `format` | string | Anulación de formato opcional |

### strip-metadata {#strip-metadata}

Elimina los metadatos EXIF, IPTC, XMP e ICC de la imagen. Sin parámetros (o con `stripAll: true`), elimina todo. Pasa banderas individuales para una eliminación selectiva.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `stripAll` | boolean | Eliminar todos los metadatos (por defecto cuando no se establece ninguna bandera) |
| `stripExif` | boolean | Eliminar los datos EXIF (incluido el GPS si `stripGps` no se establece por separado) |
| `stripGps` | boolean | Eliminar los datos de ubicación GPS |
| `stripIcc` | boolean | Eliminar el perfil de color ICC |
| `stripXmp` | boolean | Eliminar los metadatos XMP |

### Ajustes de color {#color-adjustments}

Estas operaciones modifican las propiedades de color de una imagen. Cada una toma un único valor numérico.

| Operación | Parámetro | Rango | Descripción |
|---|---|---|---|
| `brightness` | `value` | -100 a 100 | Ajustar el brillo |
| `contrast` | `value` | -100 a 100 | Ajustar el contraste |
| `saturation` | `value` | -100 a 100 | Ajustar la saturación de color |

### Filtros de color {#color-filters}

Estos aplican una transformación de color fija. No toman parámetros.

| Operación | Descripción |
|---|---|
| `grayscale` | Convertir a escala de grises |
| `sepia` | Aplicar un tono sepia |
| `invert` | Invertir todos los colores |

### Canales de color {#color-channels}

Ajusta los canales de color RGB individuales. Los valores son multiplicadores donde 100 = sin cambios.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `red` | number | Multiplicador del canal rojo (0 a 200, 100 = sin cambios) |
| `green` | number | Multiplicador del canal verde (0 a 200, 100 = sin cambios) |
| `blue` | number | Multiplicador del canal azul (0 a 200, 100 = sin cambios) |

### sharpen {#sharpen}

Enfoque simple controlado por un único valor.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `value` | number | Intensidad del enfoque (0 a 100). Se asigna a un sigma gaussiano de 0,5-10. |

### sharpen-advanced {#sharpen-advanced}

Enfoque avanzado con tres métodos seleccionables y una pasada previa opcional de reducción de ruido.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` o `high-pass` |
| `sigma` | number | Radio del desenfoque gaussiano, 0,5-10 (adaptativo) |
| `m1` | number | Enfoque de áreas planas, 0-10 (adaptativo) |
| `m2` | number | Enfoque de áreas con textura, 0-20 (adaptativo) |
| `x1` | number | Umbral plano/dentado, 0-10 (adaptativo) |
| `y2` | number | Aclarado máximo (límite de halo), 0-50 (adaptativo) |
| `y3` | number | Oscurecimiento máximo (límite de halo), 0-50 (adaptativo) |
| `amount` | number | Porcentaje de intensidad, 0-500 (máscara de enfoque) |
| `radius` | number | Radio de desenfoque, 0,1-5,0 (máscara de enfoque) |
| `threshold` | number | Brillo mínimo de borde, 0-255 (máscara de enfoque) |
| `strength` | number | Intensidad de mezcla, 0-100 (paso alto) |
| `kernelSize` | number | `3` o `5` para el núcleo 3x3 / 5x5 (paso alto) |
| `denoise` | string | Pasada previa de reducción de ruido: `off`, `light`, `medium` o `strong` |

Los parámetros son específicos de cada método. Proporciona solo los relevantes para el método elegido.

### color-blindness {#color-blindness}

Simula una deficiencia de la visión de color usando una matriz de recombinación de color 3x3.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `type` | string | Uno de: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Escribe o elimina campos de metadatos EXIF/IPTC individuales sin borrar el bloque completo.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `artist` | string | Etiqueta EXIF Artist |
| `copyright` | string | Etiqueta EXIF Copyright |
| `imageDescription` | string | Etiqueta EXIF ImageDescription |
| `software` | string | Etiqueta EXIF Software |
| `dateTime` | string | Etiqueta EXIF DateTime |
| `dateTimeOriginal` | string | Etiqueta EXIF DateTimeOriginal |
| `clearGps` | boolean | Eliminar todas las etiquetas GPS |
| `fieldsToRemove` | string[] | Lista de nombres de campos EXIF a eliminar |

Todos los parámetros son opcionales. Los campos que figuran en `fieldsToRemove` se eliminan del bloque EXIF existente. Los campos establecidos mediante los parámetros con nombre se escriben (o se sobrescriben). Las claves binarias/inseguras como MakerNote se ignoran de forma silenciosa.

## Detección de formato {#format-detection}

El motor detecta los formatos de entrada automáticamente a partir de las cabeceras de los archivos, no solo de las extensiones. Esto significa que un archivo `.jpg` que en realidad es un PNG se gestionará correctamente. La detección usa un enfoque de varias capas: primero los bytes mágicos y luego la extensión del archivo como respaldo.

SnapOtter admite **más de 55 formatos de entrada** y **13 formatos de salida**, incluidos 23 formatos RAW de cámara de más de 20 marcas, formatos profesionales (PSD, EPS, OpenEXR, HDR), códecs modernos (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) y formatos científicos/de videojuegos (FITS, DDS). La decodificación la gestiona Sharp de forma nativa siempre que es posible, con respaldo automático a ImageMagick, LibRaw y decodificadores CLI especializados.

Consulta la página [Formatos compatibles](/es/guide/supported-formats) para ver la lista completa.

## Extracción de metadatos {#metadata-extraction}

La herramienta `info` devuelve los metadatos de la imagen. Consulta [Información de la imagen](/es/tools/image/info) para ver la referencia completa de campos.

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
