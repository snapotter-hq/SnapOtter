---
description: Referencia del motor de IA con todas las herramientas de ML locales. Eliminación de fondo, escalado, OCR, detección de rostros, restauración de fotos y más.
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: 3e3b675f9a7e
---

# Referencia del motor de IA {#ai-engine-reference}

El paquete `@snapotter/ai` conecta Node.js con un **sidecar persistente de Python** para todas las operaciones de ML. El proceso del despachador permanece activo entre solicitudes para lograr un arranque en caliente rápido. NVIDIA CUDA se detecta automáticamente al iniciar y se usa cuando está disponible; de lo contrario, las herramientas de IA se ejecutan en la CPU.

Hoy no se admite la aceleración por iGPU Intel/AMD mediante VA-API, Quick Sync u OpenCL para la inferencia de IA. Asignar `/dev/dri` dentro de un contenedor no acelera estas herramientas del sidecar de Python a menos que haya disponible una GPU NVIDIA compatible con CUDA.

19 herramientas de IA del sidecar de Python en cuatro modalidades (imagen, audio, vídeo, documento), además de 2 herramientas con capacidades de IA opcionales. Todos los modelos se ejecutan localmente: no se requiere internet tras la descarga inicial del modelo.

## Arquitectura {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Un perfil de despachador "docs" separado reemplaza la lista de permitidos de IA por scripts de procesamiento de documentos (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) y omite las pesadas importaciones de ML.

**Tiempos de espera:** 300 s por defecto; el OCR y la eliminación de fondo con BiRefNet obtienen 600 s.

## Paquetes de funciones {#feature-bundles}

Cada herramienta de IA requiere que se instale un paquete de modelo antes de usarla. Los paquetes se instalan bajo demanda desde la interfaz de administración o `install_feature.py`.

| Paquete | Tamaño | Herramientas |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

---

## Eliminación de fondo {#background-removal}

**Ruta de la herramienta:** `remove-background`  
**Modelo:** rembg con BiRefNet (por defecto) o variantes de U2-Net

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `model` | string | - | Variante del modelo (anulación opcional) |
| `backgroundType` | string | `"transparent"` | Uno de: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Color hexadecimal para el fondo sólido |
| `gradientColor1` | string | - | Primer color del degradado |
| `gradientColor2` | string | - | Segundo color del degradado |
| `gradientAngle` | number | - | Ángulo del degradado en grados |
| `blurEnabled` | boolean | - | Activar el efecto de desenfoque del fondo |
| `blurIntensity` | number (0-100) | - | Intensidad del desenfoque |
| `shadowEnabled` | boolean | - | Activar la sombra paralela sobre el sujeto |
| `shadowOpacity` | number (0-100) | - | Opacidad de la sombra |
| `outputFormat` | string | - | Formato de salida: `png`, `webp` o `avif` |
| `edgeRefine` | integer (0-3) | - | Nivel de refinamiento de bordes |
| `decontaminate` | boolean | - | Eliminar el sangrado de color de los bordes |

## Reemplazo de fondo {#background-replace}

**Ruta de la herramienta:** `background-replace`  
**Modelo:** rembg / BiRefNet (compartido con remove-background)

Elimina el fondo y lo reemplaza por un color sólido o un degradado.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Modo de fondo |
| `color` | string | `"#ffffff"` | Color hexadecimal del fondo (cuando `backgroundType` es `color`) |
| `gradientColor1` | string | - | Primer color hexadecimal del degradado |
| `gradientColor2` | string | - | Segundo color hexadecimal del degradado |
| `gradientAngle` | integer (0-360) | `180` | Ángulo del degradado en grados |
| `feather` | integer (0-20) | `0` | Radio de suavizado de bordes |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato de salida |

## Desenfocar fondo {#blur-background}

**Ruta de la herramienta:** `blur-background`  
**Modelo:** rembg / BiRefNet (compartido con remove-background)

Desenfoca el fondo mientras mantiene nítido al sujeto.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensidad del desenfoque |
| `feather` | integer (0-20) | `0` | Radio de suavizado de bordes |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato de salida |

## Escalado de imagen {#image-upscaling}

**Ruta de la herramienta:** `upscale`  
**Modelo:** RealESRGAN (con respaldo Lanczos cuando no está disponible)

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Factor de escalado |
| `model` | string | `"auto"` | Variante del modelo |
| `faceEnhance` | boolean | `false` | Aplicar una pasada de mejora de rostros con GFPGAN |
| `denoise` | number | `0` | Intensidad de reducción de ruido |
| `format` | string | `"auto"` | Anulación del formato de salida |
| `quality` | number | `95` | Calidad de salida (1-100) |

## OCR / Extracción de texto {#ocr-text-extraction}

**Ruta de la herramienta:** `ocr`  
**Modelos:** Tesseract (rápido), PaddleOCR PP-OCRv5 (equilibrado), PaddleOCR-VL 1.5 (mejor)

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Nivel de procesamiento |
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Preprocesar la imagen para mejorar la precisión del OCR |
| `engine` | string | - | Obsoleto. Asigna `tesseract` a `fast`, `paddleocr` a `balanced` |

Devuelve resultados estructurados con cuadros delimitadores, puntuaciones de confianza y bloques de texto extraído.

## OCR de PDF {#pdf-ocr}

**Ruta de la herramienta:** `ocr-pdf`  
**Modelos:** El mismo sistema de niveles que el OCR de imagen

Extrae texto de documentos PDF escaneados mediante OCR con IA, página por página.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Nivel de procesamiento |
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Selección de páginas: `"all"`, `"1-3"`, `"1,3,5"` |

## Desenfoque de rostros / PII {#face-pii-blur}

**Ruta de la herramienta:** `blur-faces`  
**Modelo:** Detección de rostros con MediaPipe

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Radio del desenfoque gaussiano |
| `sensitivity` | number (0-1) | `0.5` | Umbral de confianza de detección |

## Mejora de rostros {#face-enhancement}

**Ruta de la herramienta:** `enhance-faces`  
**Modelos:** GFPGAN, CodeFormer

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Modelo de mejora |
| `strength` | number (0-1) | `0.8` | Intensidad de la mejora |
| `sensitivity` | number (0-1) | `0.5` | Umbral de detección de rostros |
| `onlyCenterFace` | boolean | `false` | Mejorar solo el rostro más central |

## Coloración con IA {#ai-colorization}

**Ruta de la herramienta:** `colorize`  
**Modelo:** DDColor (con respaldo OpenCV DNN)

Convierte fotos en blanco y negro o en escala de grises a color completo.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Intensidad de la saturación de color |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Variante del modelo |

## Eliminación de ruido {#noise-removal}

**Ruta de la herramienta:** `noise-removal`  
**Modelo:** SCUNet (canalización de reducción de ruido por niveles)

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Nivel de procesamiento |
| `strength` | number (0-100) | `50` | Intensidad de reducción de ruido |
| `detailPreservation` | number (0-100) | `50` | Cuánto detalle conservar; valores más altos mantienen más textura |
| `colorNoise` | number (0-100) | `30` | Intensidad de la reducción de ruido de color |
| `format` | string | `"original"` | Formato de salida: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Calidad de codificación de salida |

## Eliminación de ojos rojos {#red-eye-removal}

**Ruta de la herramienta:** `red-eye-removal`

Detecta puntos de referencia faciales, localiza las regiones oculares y corrige la sobresaturación del canal rojo.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Umbral de detección de píxeles rojos |
| `strength` | number (0-100) | `70` | Intensidad de la corrección |
| `format` | string | - | Anulación del formato de salida (opcional) |
| `quality` | number (1-100) | `90` | Calidad de salida |

## Restauración de fotos {#photo-restoration}

**Ruta de la herramienta:** `restore-photo`

Canalización de varios pasos para fotos antiguas o dañadas: detección y reparación de arañazos/roturas, mejora de rostros, reducción de ruido y coloración opcional.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Detectar y reparar arañazos y roturas |
| `faceEnhancement` | boolean | `true` | Aplicar una pasada de mejora de rostros |
| `fidelity` | number (0-1) | `0.7` | Intensidad de la mejora de rostros (más alto = más conservador) |
| `denoise` | boolean | `true` | Aplicar una pasada de reducción de ruido |
| `denoiseStrength` | number (0-100) | `25` | Intensidad de reducción de ruido |
| `colorize` | boolean | `false` | Colorear tras la restauración |
| `colorizeStrength` | number (0-100) | `85` | Intensidad de la coloración |

## Foto de pasaporte {#passport-photo}

**Ruta de la herramienta:** `passport-photo`  
**Modelos:** puntos de referencia faciales de MediaPipe + eliminación de fondo con BiRefNet

Flujo de trabajo en dos fases: analizar (detectar el rostro + eliminar el fondo) y luego generar (recortar, redimensionar, mosaico). Admite más de 37 países en 6 regiones.

### Fase 1: Analizar {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Acepta un archivo de imagen (multipart). Devuelve los datos de puntos de referencia faciales, una vista previa en base64 y las dimensiones de la imagen.

### Fase 2: Generar {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Acepta un cuerpo JSON con los resultados de la Fase 1 más los ajustes de generación:

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `jobId` | string | (obligatorio) | ID del trabajo de la Fase 1 |
| `filename` | string | (obligatorio) | Nombre de archivo original de la Fase 1 |
| `countryCode` | string | (obligatorio) | Código de país ISO (p. ej., `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Tipo de documento |
| `bgColor` | string | `"#FFFFFF"` | Color de fondo hexadecimal |
| `printLayout` | string | `"none"` | Diseño de impresión: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Tamaño máximo de archivo en KB (0 = sin límite) |
| `dpi` | number (72-1200) | `300` | DPI de salida |
| `customWidthMm` | number | - | Ancho personalizado en mm (anula la especificación del país) |
| `customHeightMm` | number | - | Alto personalizado en mm (anula la especificación del país) |
| `zoom` | number (0.5-3) | `1` | Factor de zoom |
| `adjustX` | number | `0` | Ajuste de la posición horizontal |
| `adjustY` | number | `0` | Ajuste de la posición vertical |
| `landmarks` | object | (obligatorio) | Puntos de referencia de la Fase 1 |
| `imageWidth` | number | (obligatorio) | Ancho de la imagen de la Fase 1 |
| `imageHeight` | number | (obligatorio) | Alto de la imagen de la Fase 1 |

## Borrado de objetos (relleno) {#object-erasing-inpainting}

**Ruta de la herramienta:** `erase-object`  
**Modelo:** LaMa mediante ONNX Runtime

La máscara se envía como **una segunda parte de archivo** (nombre de campo `mask`), no en base64. Los píxeles blancos de la máscara indican las áreas que se van a borrar. Los ajustes `format` y `quality` se envían como campos de formulario de nivel superior.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `file` | file | (obligatorio) | Imagen de origen (multipart) |
| `mask` | file | (obligatorio) | Imagen de máscara (multipart, nombre de campo `mask`, blanco = borrar) |
| `format` | string | `"auto"` | Formato de salida: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Calidad de salida |

Acelerado con CUDA cuando hay una GPU NVIDIA disponible.

## Expansión de lienzo con IA {#ai-canvas-expand}

**Ruta de la herramienta:** `ai-canvas-expand`  
**Modelo:** outpainting basado en LaMa

Expande el lienzo de una imagen en cualquier dirección y rellena las nuevas áreas con contenido generado por IA que coincide con la imagen existente.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Píxeles a extender en la parte superior |
| `extendRight` | integer | `0` | Píxeles a extender a la derecha |
| `extendBottom` | integer | `0` | Píxeles a extender en la parte inferior |
| `extendLeft` | integer | `0` | Píxeles a extender a la izquierda |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Nivel de calidad |
| `format` | string | `"auto"` | Formato de salida: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Calidad de salida |

Al menos una dirección de extensión debe ser mayor que 0.

## Recorte inteligente {#smart-crop}

**Ruta de la herramienta:** `smart-crop`  
**Modelo:** Detección de rostros con MediaPipe (solo en modo rostro)

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Estrategia de recorte: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Estrategia para el modo sujeto |
| `width` | integer | - | Ancho de salida |
| `height` | integer | - | Alto de salida |
| `padding` | integer (0-50) | `0` | Porcentaje de relleno alrededor del sujeto |
| `facePreset` | string | `"head-shoulders"` | Encuadre predefinido cuando `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Umbral de detección de rostros |
| `threshold` | integer (0-255) | `30` | Umbral de detección de fondo (modo recorte) |
| `padToSquare` | boolean | `false` | Rellenar el resultado recortado hasta un cuadrado |
| `padColor` | string | `"#ffffff"` | Color de fondo para el relleno cuadrado |
| `targetSize` | integer | - | Tamaño objetivo para la salida rellenada (píxeles) |
| `quality` | integer (1-100) | - | Calidad de salida |

Los valores heredados de `mode` `attention` y `content` se aceptan y se asignan a `subject` y `trim` respectivamente.

**Ajustes predefinidos de rostro:**

| Predefinido | Ideal para |
|--------|---------|
| `closeup` | Retratos de rostro |
| `head-shoulders` | Fotos de perfil |
| `upper-body` | LinkedIn / formal |
| `half-body` | Torso completo |

## Transcribir audio {#transcribe-audio}

**Ruta de la herramienta:** `transcribe-audio`  
**Modelo:** faster-whisper

Convierte voz en texto. Admite formatos de salida de texto plano, SRT y VTT.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Formato de salida |

## Subtítulos automáticos {#auto-subtitles}

**Ruta de la herramienta:** `auto-subtitles`  
**Modelo:** faster-whisper (extrae el audio del vídeo y luego lo transcribe)

Genera archivos de subtítulos a partir de la pista de audio de un vídeo.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Formato de subtítulo de salida |

## Corrector de transparencia PNG {#png-transparency-fixer}

**Ruta de la herramienta:** `transparency-fixer`  
**Modelo:** BiRefNet HR-matting (resolución 2048x2048)

Corrige PNG con "transparencia falsa" donde se eliminó el fondo pero quedaron flecos, halos o artefactos semitransparentes. Usa el modelo de matting de alta resolución de BiRefNet para producir un canal alfa limpio y luego aplica un procesamiento de eliminación de flecos configurable para retirar la contaminación de color a lo largo de los bordes.

**Cadena de respaldo ante OOM:** Si BiRefNet HR-matting supera la memoria disponible, la herramienta recurre automáticamente a `birefnet-general` y luego a `u2net`.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Intensidad de la eliminación de flecos en los bordes para retirar la contaminación de color |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Formato de la imagen de salida |
| `removeWatermark` | boolean | `false` | Aplicar preprocesamiento de eliminación de marcas de agua (filtro de mediana) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Herramientas con capacidades de IA opcionales {#tools-with-optional-ai-capabilities}

Las siguientes herramientas no son herramientas del sidecar de Python, pero usan funciones de IA cuando se activan ciertas opciones.

### Mejora de imagen {#image-enhancement}

**Ruta de la herramienta:** `image-enhancement`  
**Motor:** Basado en análisis (histograma y estadísticas de Sharp)

Analiza la imagen y aplica correcciones automáticas de exposición, contraste, balance de blancos, saturación, nitidez y ruido. Admite modos específicos de escena.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Modo de escena para ajustar las correcciones |
| `intensity` | number (0-100) | `50` | Intensidad general de la corrección |
| `corrections.exposure` | boolean | `true` | Aplicar corrección de exposición |
| `corrections.contrast` | boolean | `true` | Aplicar corrección de contraste |
| `corrections.whiteBalance` | boolean | `true` | Aplicar corrección del balance de blancos |
| `corrections.saturation` | boolean | `true` | Aplicar corrección de saturación |
| `corrections.sharpness` | boolean | `true` | Aplicar corrección de nitidez |
| `corrections.denoise` | boolean | `true` | Aplicar reducción de ruido |
| `deepEnhance` | boolean | `false` | Activar la eliminación de ruido con IA mediante SCUNet (requiere el paquete `upscale-enhance`) |

Hay disponible un endpoint de análisis adicional en `POST /api/v1/tools/image/image-enhancement/analyze` que devuelve las correcciones detectadas sin aplicarlas.

### Redimensionado con reconocimiento de contenido (seam carving) {#content-aware-resize-seam-carving}

**Ruta de la herramienta:** `content-aware-resize`  
**Motor:** Binario Go `caire` (no Python: sin beneficio de GPU)

Redimensiona imágenes de forma inteligente eliminando costuras de baja energía y preservando el contenido importante.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `width` | number | - | Ancho objetivo |
| `height` | number | - | Alto objetivo |
| `protectFaces` | boolean | `false` | Proteger las regiones de rostros detectadas (requiere el paquete `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Desenfoque previo para el cálculo de energía |
| `sobelThreshold` | number (1-20) | `2` | Umbral de sensibilidad de bordes |
| `square` | boolean | `false` | Forzar salida cuadrada |
