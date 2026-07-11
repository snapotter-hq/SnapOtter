---
description: "Referencia del motor de IA con todas las herramientas de ML locales. Eliminación de fondo, escalado, OCR, detección de rostros, restauración de fotos y más."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: 73caa426553a
---

# Referencia del motor de IA {#ai-engine-reference}

El paquete `@snapotter/ai` conecta Node.js con un **sidecar de Python persistente** para todas las operaciones de ML. El proceso despachador permanece activo entre solicitudes para lograr un arranque en caliente rápido. NVIDIA CUDA se detecta automáticamente al inicio y se usa cuando está disponible; de lo contrario, las herramientas de IA se ejecutan en la CPU.

La aceleración con iGPU de Intel/AMD a través de VA-API, Quick Sync u OpenCL no es compatible hoy con la inferencia de IA. Mapear `/dev/dri` dentro de un contenedor no acelera estas herramientas del sidecar de Python a menos que haya disponible una GPU NVIDIA compatible con CUDA.

19 herramientas de IA del sidecar de Python en cuatro modalidades (imagen, audio, video, documento), más 2 herramientas con capacidades de IA opcionales. Todos los modelos se ejecutan localmente: no se requiere internet tras la descarga inicial del modelo.

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

Un perfil de despachador "docs" independiente reemplaza la lista de permitidos de IA con scripts de procesamiento de documentos (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) y omite las importaciones pesadas de ML.

**Tiempos de espera:** 300 s por defecto; OCR y la eliminación de fondo con BiRefNet obtienen 600 s.

## Paquetes de funciones {#feature-bundles}

Los modelos de IA se empaquetan por pila de dependencias compartida, no un archivo por herramienta. Un paquete de funciones puede habilitar varias herramientas cuando estas usan la misma familia de modelos, los mismos wheels de Python o las mismas librerías nativas. Esto mantiene la imagen Docker de la versión más pequeña y evita almacenar copias duplicadas de los mismos modelos de matting de fondo, detección de rostros, OCR, restauración y voz.

La imagen Docker incluye la aplicación más el entorno de ejecución común. Los archivos de modelos grandes se descargan bajo demanda en el volumen persistente `/data/ai`, y luego los reutiliza cada herramienta que los necesite. Si un paquete ya está instalado porque otra herramienta lo necesitó, habilitar una nueva herramienta dependiente no vuelve a descargar ese paquete.

Cada herramienta de IA requiere uno o más paquetes de funciones antes de poder ejecutarse. La interfaz de administración instala por herramienta a través de `POST /api/v1/admin/tools/:toolId/features/install`, que resuelve la lista completa de paquetes, omite los paquetes que ya están instalados y encola solo las descargas faltantes. Por ejemplo, habilitar Foto de pasaporte en una instancia nueva encola `background-removal` y `face-detection`; habilitarla después de que Eliminación de fondo ya está instalado encola solo `face-detection`.

| Paquete | Tamaño | Grupo de dependencias compartidas | Herramientas que lo usan |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | matting de fondo rembg / BiRefNet | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | detección de rostros y puntos de referencia de MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | inpainting/outpainting con LaMa y DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, reducción de ruido | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | reparación de arañazos y pipeline de restauración | restore-photo |
| `ocr` | 5-6 GB | pila de OCR PaddleOCR / Tesseract | ocr, ocr-pdf |
| `transcription` | ~600 MB | modelos de voz a texto faster-whisper | transcribe-audio, auto-subtitles |

Herramientas con dependencias entre paquetes:

| Herramienta | Paquetes requeridos | Motivo |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Elimina el fondo y luego usa los puntos de referencia del rostro para encuadrar el recorte según las reglas de fotos de pasaporte y de identificación. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Detecta rostros antes de ejecutar la mejora con GFPGAN o CodeFormer en las regiones de rostro seleccionadas. |

Una herramienta está disponible solo cuando todos sus paquetes requeridos están instalados. Las instalaciones parciales son válidas y se manejan de forma incremental: los paquetes instalados se reutilizan, los paquetes faltantes se muestran como descargas y las instalaciones en cola se ejecutan una a la vez para que el entorno de Python compartido no se modifique de forma concurrente.

---

## Eliminación de fondo {#background-removal}

**Ruta de la herramienta:** `remove-background`  
**Modelo:** rembg con BiRefNet (por defecto) o variantes de U2-Net

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `model` | string | - | Variante del modelo (anulación opcional) |
| `backgroundType` | string | `"transparent"` | Uno de: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Color hexadecimal para fondo sólido |
| `gradientColor1` | string | - | Primer color del degradado |
| `gradientColor2` | string | - | Segundo color del degradado |
| `gradientAngle` | number | - | Ángulo del degradado en grados |
| `blurEnabled` | boolean | - | Activar el efecto de desenfoque de fondo |
| `blurIntensity` | number (0-100) | - | Intensidad del desenfoque |
| `shadowEnabled` | boolean | - | Activar la sombra proyectada sobre el sujeto |
| `shadowOpacity` | number (0-100) | - | Opacidad de la sombra |
| `outputFormat` | string | - | Formato de salida: `png`, `webp` o `avif` |
| `edgeRefine` | integer (0-3) | - | Nivel de refinamiento de bordes |
| `decontaminate` | boolean | - | Eliminar la contaminación de color de los bordes |

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
| `feather` | integer (0-20) | `0` | Radio de difuminado de bordes |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato de salida |

## Desenfocar fondo {#blur-background}

**Ruta de la herramienta:** `blur-background`  
**Modelo:** rembg / BiRefNet (compartido con remove-background)

Desenfoca el fondo mientras mantiene nítido al sujeto.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensidad del desenfoque |
| `feather` | integer (0-20) | `0` | Radio de difuminado de bordes |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato de salida |

## Escalado de imagen {#image-upscaling}

**Ruta de la herramienta:** `upscale`  
**Modelo:** RealESRGAN (con respaldo Lanczos cuando no está disponible)

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Factor de escalado |
| `model` | string | `"auto"` | Variante del modelo |
| `faceEnhance` | boolean | `false` | Aplicar una pasada de mejora de rostros con GFPGAN |
| `denoise` | number | `0` | Intensidad de la reducción de ruido |
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
| `engine` | string | - | Obsoleto. Asigna `tesseract` a `fast`, y `paddleocr` a `balanced` |

Devuelve resultados estructurados con cuadros delimitadores, puntuaciones de confianza y bloques de texto extraídos.

## OCR de PDF {#pdf-ocr}

**Ruta de la herramienta:** `ocr-pdf`  
**Modelos:** El mismo sistema de niveles que el OCR de imágenes

Extrae texto de documentos PDF escaneados usando OCR con IA, página por página.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Nivel de procesamiento |
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Selección de páginas: `"all"`, `"1-3"`, `"1,3,5"` |

## Desenfoque de rostros / PII {#face-pii-blur}

**Ruta de la herramienta:** `blur-faces`  
**Modelo:** detección de rostros de MediaPipe

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
**Modelo:** SCUNet (pipeline de reducción de ruido por niveles)

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Nivel de procesamiento |
| `strength` | number (0-100) | `50` | Intensidad de la reducción de ruido |
| `detailPreservation` | number (0-100) | `50` | Cuánto detalle preservar; un valor más alto conserva más textura |
| `colorNoise` | number (0-100) | `30` | Intensidad de la reducción de ruido de color |
| `format` | string | `"original"` | Formato de salida: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Calidad de codificación de salida |

## Eliminación de ojos rojos {#red-eye-removal}

**Ruta de la herramienta:** `red-eye-removal`

Detecta los puntos de referencia del rostro, localiza las regiones de los ojos y corrige la sobresaturación del canal rojo.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Umbral de detección de píxeles rojos |
| `strength` | number (0-100) | `70` | Intensidad de la corrección |
| `format` | string | - | Anulación del formato de salida (opcional) |
| `quality` | number (1-100) | `90` | Calidad de salida |

## Restauración de fotos {#photo-restoration}

**Ruta de la herramienta:** `restore-photo`

Pipeline de varios pasos para fotos antiguas o dañadas: detección y reparación de arañazos/roturas, mejora de rostros, reducción de ruido y coloración opcional.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Detectar y reparar arañazos, roturas |
| `faceEnhancement` | boolean | `true` | Aplicar una pasada de mejora de rostros |
| `fidelity` | number (0-1) | `0.7` | Intensidad de la mejora de rostros (mayor = más conservador) |
| `denoise` | boolean | `true` | Aplicar una pasada de reducción de ruido |
| `denoiseStrength` | number (0-100) | `25` | Intensidad de la reducción de ruido |
| `colorize` | boolean | `false` | Colorizar tras la restauración |
| `colorizeStrength` | number (0-100) | `85` | Intensidad de la coloración |

## Foto de pasaporte {#passport-photo}

**Ruta de la herramienta:** `passport-photo`  
**Modelos:** puntos de referencia del rostro de MediaPipe + eliminación de fondo con BiRefNet

Flujo de trabajo en dos fases: analizar (detectar rostro + eliminar fondo) y luego generar (recortar, redimensionar, mosaico). Admite más de 37 países en 6 regiones.

### Fase 1: Analizar {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Acepta un archivo de imagen (multipart). Devuelve los datos de puntos de referencia del rostro, una vista previa en base64 y las dimensiones de la imagen.

### Fase 2: Generar {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Acepta un cuerpo JSON con los resultados de la Fase 1 más los ajustes de generación:

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `jobId` | string | (requerido) | ID del trabajo de la Fase 1 |
| `filename` | string | (requerido) | Nombre de archivo original de la Fase 1 |
| `countryCode` | string | (requerido) | Código de país ISO (p. ej., `US`, `GB`, `IN`) |
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
| `landmarks` | object | (requerido) | Puntos de referencia de la Fase 1 |
| `imageWidth` | number | (requerido) | Ancho de imagen de la Fase 1 |
| `imageHeight` | number | (requerido) | Alto de imagen de la Fase 1 |

## Borrado de objetos (inpainting) {#object-erasing-inpainting}

**Ruta de la herramienta:** `erase-object`  
**Modelo:** LaMa vía ONNX Runtime

La máscara se envía como una **segunda parte de archivo** (nombre de campo `mask`), no como base64. Los píxeles blancos en la máscara indican las áreas a borrar. Los ajustes `format` y `quality` se envían como campos de formulario de nivel superior.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `file` | file | (requerido) | Imagen de origen (multipart) |
| `mask` | file | (requerido) | Imagen de máscara (multipart, nombre de campo `mask`, blanco = borrar) |
| `format` | string | `"auto"` | Formato de salida: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Calidad de salida |

Acelerado por CUDA cuando hay disponible una GPU NVIDIA.

## Expansión de lienzo con IA {#ai-canvas-expand}

**Ruta de la herramienta:** `ai-canvas-expand`  
**Modelo:** outpainting basado en LaMa

Expande el lienzo de una imagen en cualquier dirección y rellena las áreas nuevas con contenido generado por IA que coincide con la imagen existente.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Píxeles a extender por arriba |
| `extendRight` | integer | `0` | Píxeles a extender por la derecha |
| `extendBottom` | integer | `0` | Píxeles a extender por abajo |
| `extendLeft` | integer | `0` | Píxeles a extender por la izquierda |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Nivel de calidad |
| `format` | string | `"auto"` | Formato de salida: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Calidad de salida |

Al menos una dirección de extensión debe ser mayor que 0.

## Recorte inteligente {#smart-crop}

**Ruta de la herramienta:** `smart-crop`  
**Modelo:** detección de rostros de MediaPipe (solo en modo rostro)

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

Los valores heredados de `mode`, `attention` y `content`, se aceptan y se asignan a `subject` y `trim` respectivamente.

**Ajustes predefinidos de rostro:**

| Ajuste predefinido | Mejor para |
|--------|---------|
| `closeup` | Retratos de cabeza |
| `head-shoulders` | Fotos de perfil |
| `upper-body` | LinkedIn / formal |
| `half-body` | Parte superior completa del cuerpo |

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
**Modelo:** faster-whisper (extrae el audio del video y luego lo transcribe)

Genera archivos de subtítulos a partir de la pista de audio de un video.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Formato de subtítulos de salida |

## Corrector de transparencia PNG {#png-transparency-fixer}

**Ruta de la herramienta:** `transparency-fixer`  
**Modelo:** matting HR de BiRefNet (resolución 2048x2048)

Corrige los PNG con "falsa transparencia", donde se eliminó el fondo pero quedaron bordes irregulares, halos o artefactos semitransparentes. Usa el modelo de matting de alta resolución de BiRefNet para producir un canal alfa limpio y luego aplica un procesamiento de eliminación de bordes configurable para quitar la contaminación de color a lo largo de los bordes.

**Cadena de respaldo ante OOM:** Si el matting HR de BiRefNet supera la memoria disponible, la herramienta recurre automáticamente a `birefnet-general`, y luego a `u2net`.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Intensidad de la eliminación de bordes para quitar la contaminación de color |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Formato de imagen de salida |
| `removeWatermark` | boolean | `false` | Aplicar preprocesamiento de eliminación de marca de agua (filtro de mediana) |

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
| `corrections.whiteBalance` | boolean | `true` | Aplicar corrección de balance de blancos |
| `corrections.saturation` | boolean | `true` | Aplicar corrección de saturación |
| `corrections.sharpness` | boolean | `true` | Aplicar corrección de nitidez |
| `corrections.denoise` | boolean | `true` | Aplicar reducción de ruido |
| `deepEnhance` | boolean | `false` | Activar la eliminación de ruido con IA vía SCUNet (requiere el paquete `upscale-enhance`) |

Hay disponible un endpoint de análisis adicional en `POST /api/v1/tools/image/image-enhancement/analyze` que devuelve las correcciones detectadas sin aplicarlas.

### Redimensionado con reconocimiento de contenido (seam carving) {#content-aware-resize-seam-carving}

**Ruta de la herramienta:** `content-aware-resize`  
**Motor:** binario `caire` de Go (no Python: sin beneficio de GPU)

Redimensiona imágenes de forma inteligente eliminando costuras de baja energía, preservando el contenido importante.

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|---------|-------------|
| `width` | number | - | Ancho objetivo |
| `height` | number | - | Alto objetivo |
| `protectFaces` | boolean | `false` | Proteger las regiones de rostro detectadas (requiere el paquete `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Predesenfoque para el cálculo de energía |
| `sobelThreshold` | number (1-20) | `2` | Umbral de sensibilidad de bordes |
| `square` | boolean | `false` | Forzar salida cuadrada |
