---
description: Referencia completa de la API REST. Endpoints de herramientas, procesamiento por lotes, canalizaciones, biblioteca de archivos, autenticación, equipos y operaciones de administración.
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: 25e61e554254
---

# Referencia de la API REST {#rest-api-reference}

La documentación interactiva de la API con ejemplos de solicitud/respuesta está disponible en [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Especificaciones legibles por máquina:
- `/api/v1/openapi.yaml` - especificación OpenAPI 3.1
- `/llms.txt` - resumen apto para LLM
- `/llms-full.txt` - documentación completa apta para LLM

## Autenticación {#authentication}

Todos los endpoints requieren autenticación salvo que `AUTH_ENABLED=false`.

### Token de sesión {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

Las sesiones caducan a los 7 días (configurable mediante `SESSION_DURATION_HOURS`).

### Claves de API {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Las claves llevan el prefijo `si_` y se almacenan como hashes scrypt: la clave sin procesar se muestra una vez y nunca puede recuperarse de nuevo.

### Endpoints de autenticación {#auth-endpoints}

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Público | Iniciar sesión, obtener token de sesión |
| `POST` | `/api/auth/logout` | Auth | Destruir la sesión actual |
| `GET` | `/api/auth/session` | Auth | Validar la sesión actual |
| `POST` | `/api/auth/change-password` | Auth | Cambiar la propia contraseña (invalida todas las demás sesiones + claves de API) |
| `GET` | `/api/auth/users` | Admin | Listar todos los usuarios |
| `POST` | `/api/auth/register` | Admin | Crear un usuario nuevo |
| `PUT` | `/api/auth/users/:id` | Admin | Actualizar el rol o el equipo de un usuario |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Restablecer la contraseña de un usuario |
| `DELETE` | `/api/auth/users/:id` | Admin | Eliminar un usuario |
| `GET` | `/api/v1/config/auth` | Público | Comprobar si la autenticación está habilitada (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Iniciar el registro de MFA TOTP. Requiere la función empresarial `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Confirmar el registro de MFA con un código TOTP |
| `POST` | `/api/auth/mfa/complete` | Público | Completar un desafío de inicio de sesión con MFA pendiente |
| `POST` | `/api/auth/mfa/disable` | Auth | Deshabilitar MFA para el usuario actual |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Restablecer MFA para un usuario |
| `GET` | `/api/auth/oidc/login` | Público | Iniciar el inicio de sesión OIDC cuando OIDC está habilitado |
| `GET` | `/api/auth/oidc/callback` | Público | Devolución de llamada de autorización OIDC |
| `GET` | `/api/auth/saml/metadata` | Público | XML de metadatos del SP de SAML cuando SAML está habilitado |
| `GET` | `/api/auth/saml/login` | Público | Iniciar el inicio de sesión SAML |
| `POST` | `/api/auth/saml/callback` | Público | Servicio de consumidor de aserciones SAML |

Cuando MFA está habilitado para un usuario, `POST /api/auth/login` devuelve `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` en lugar de un token de sesión. Envía ese `mfaToken` junto con un código TOTP o de recuperación a `/api/auth/mfa/complete`.

### Permisos {#permissions}

| Permiso | Admin | Usuario |
|-----------|:-----:|:----:|
| Usar herramientas | ✓ | ✓ |
| Archivos/canalizaciones/claves de API propios | ✓ | ✓ |
| Ver archivos/canalizaciones/claves de todos los usuarios | ✓ | - |
| Escribir ajustes | ✓ | - |
| Gestionar usuarios y equipos | ✓ | - |
| Gestionar la marca | ✓ | - |

## Comprobación de estado {#health-check}

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Público | Comprobación de estado básica. Devuelve `{"status":"healthy","version":"..."}` con 200, o `{"status":"unhealthy"}` con 503 si la base de datos no está accesible. |
| `GET` | `/api/v1/readyz` | Público | Sonda de preparación. Comprueba PostgreSQL, Redis, el espacio en disco y S3 cuando está configurado. Devuelve 503 cuando la instancia no debe recibir tráfico. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Diagnóstico detallado que incluye tiempo de actividad, modo de almacenamiento, estado de la base de datos, estado de la cola y disponibilidad de GPU. |

## Uso de las herramientas {#using-tools}

Todas las herramientas siguen el mismo patrón:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` es uno de `image`, `video`, `audio`, `pdf` o `files`.

- La subida es `multipart/form-data`.
- `settings` es una cadena JSON con opciones específicas de la herramienta.
- `clientJobId` es un campo de formulario opcional para la correlación del progreso proporcionada por quien llama.
- `fileId` es un campo de formulario opcional que hace referencia a un elemento existente de la biblioteca de archivos. Cuando está presente, el resultado procesado se guarda como una nueva versión y la respuesta incluye `savedFileId`.
- **Herramientas rápidas** normalmente devuelven JSON 200: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Obtén el archivo procesado desde `downloadUrl`.
- **Cualquier herramienta encolada** puede devolver JSON 202 si tarda mucho o supera la ventana de espera síncrona: `{"jobId":"...","async":true}`. Conéctate a SSE para el progreso y luego descarga cuando finalice (consulta [Seguimiento del progreso](#progress-tracking)).
- Las rutas **de lote** devuelven un archivo ZIP transmitido directamente (con la cabecera `X-Job-Id`) para las herramientas registradas en el registro genérico de lotes.

## Referencia de herramientas {#tools-reference}

### Ajustes preestablecidos de conversión {#conversion-presets}

El catálogo compartido incluye 83 endpoints dedicados de ajustes preestablecidos de conversión, como `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` y `excel-to-csv`. Los ajustes preestablecidos son rutas de herramienta de primera clase:

`POST /api/v1/tools/<section>/<presetId>`

Cada ajuste preestablecido bloquea el formato de salida y delega en una herramienta base como `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` o `convert-spreadsheet`. Consulta [Ajustes preestablecidos de conversión](/es/tools/conversion-presets) para ver la tabla de rutas completa y los ajustes opcionales.

### Esenciales {#essentials}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `resize` | Redimensionar | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, además de 23 ajustes preestablecidos para redes sociales |
| `crop` | Recortar | `left`, `top`, `width`, `height`, `unit` (px/porcentaje) |
| `rotate` | Rotar y voltear | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Convertir | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Comprimir | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimización {#optimization}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `optimize-for-web` | Optimizar para la web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Eliminar metadatos | - |
| `edit-metadata` | Editar metadatos | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Renombrado masivo | `pattern` (admite `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Imagen a PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Generador de favicon | `padding`, `backgroundColor`, `borderRadius` - genera todos los tamaños estándar |

### Ajustes {#adjustments}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `adjust-colors` | Ajustar colores | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Enfoque | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Reemplazar color | `sourceColor`, `targetColor` (reemplazo), `makeTransparent`, `tolerance` |
| `color-blindness` | Simulación de daltonismo | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, valor predeterminado "deuteranomaly") |
| `duotone` | Duotono | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelar | `blockSize` (2-128), `region` ({left, top, width, height} para pixelado parcial) |
| `vignette` | Viñeta | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Herramientas de IA {#ai-tools}

Todas las herramientas de IA se ejecutan en tu hardware: CPU de forma predeterminada, o NVIDIA CUDA cuando hay disponible una GPU NVIDIA compatible. Hoy no se admite la aceleración de iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL para la inferencia de IA. No se requiere conexión a internet.

| ID de herramienta | Nombre | Modelo de IA | Ajustes clave |
|---------|------|---------|-------------|
| `remove-background` | Eliminar fondo | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Ampliación de imagen | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Borrador de objetos | LaMa (ONNX) | Máscara enviada como segunda parte del archivo (nombre de campo `mask`), `format`, `quality` |
| `ocr` | OCR / Extracción de texto | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Desenfoque de rostros / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Recorte inteligente | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Mejora de imagen | Basada en análisis | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Mejora de rostros | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Coloración con IA | DDColor | `intensity`, `model` |
| `noise-removal` | Eliminación de ruido | Reducción de ruido escalonada | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Eliminación de ojos rojos | Puntos de referencia faciales + análisis de color | `sensitivity`, `strength` |
| `restore-photo` | Restauración de fotos | Canalización de varios pasos | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Foto de pasaporte | Puntos de referencia de MediaPipe | Flujo en dos fases. El análisis usa multipart `file`; la generación usa JSON con `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), puntos de referencia y dimensiones de la imagen |
| `content-aware-resize` | Redimensionado con reconocimiento de contenido | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Corrector de transparencia PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Reemplazar fondo | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Desenfocar fondo | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Expansión de lienzo con IA | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Marca de agua y superposición {#watermark-overlay}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `watermark-text` | Marca de agua de texto | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Marca de agua de imagen | `opacity`, `position`, `scale` - el segundo archivo es la marca de agua |
| `text-overlay` | Superposición de texto | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Composición de imágenes | `x`, `y`, `opacity`, `blend` - el segundo archivo se superpone encima |
| `meme-generator` | Generador de memes | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Admite el modo plantilla (cuerpo JSON con `templateId`) o el modo de imagen personalizada (multipart con archivo). |

### Utilidades {#utilities}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `info` | Información de imagen | - (devuelve ancho, alto, formato, tamaño, canales, hasAlpha, DPI, EXIF) |
| `compare` | Comparar imágenes | `mode` (side-by-side/overlay/diff), `diffThreshold` - el segundo archivo es el objetivo de comparación |
| `find-duplicates` | Buscar duplicados | `threshold` (distancia de hash perceptual, valor predeterminado 8) - varios archivos |
| `color-palette` | Paleta de colores | `count` (número de colores dominantes), `format` (hex/rgb) |
| `qr-generate` | Generador de códigos QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (archivo opcional) |
| `barcode-read` | Lector de códigos de barras | - (detecta automáticamente QR, EAN, Code128, DataMatrix, etc.) |
| `image-to-base64` | Imagen a Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML a imagen | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histograma | `scale` (linear/log) - devuelve un gráfico de histograma RGB + estadísticas por canal |
| `lqip-placeholder` | Marcador de posición LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Generador de códigos de barras | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Cuerpo JSON, sin subida de archivos. |

### Diseño y composición {#layout-composition}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `collage` | Collage / Cuadrícula | `template` (más de 25 diseños), `gap`, `backgroundColor`, `borderRadius` - varios archivos |
| `stitch` | Unir / Combinar | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - varios archivos |
| `split` | División de imágenes | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Borde y marco | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Embellecer captura de pantalla | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Recorte circular | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Relleno de imagen | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Hoja de sprites | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - varios archivos (2-64 imágenes) |

### Formato y conversión {#format-conversion}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `svg-to-raster` | SVG a ráster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Imagen a SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Herramientas GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), parámetros específicos de cada acción |
| `gif-webp` | Convertidor GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Herramientas de vídeo {#video-tools}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `convert-video` | Convertir vídeo | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Comprimir vídeo | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Recortar vídeo | `startS`, `endS`, `precise` (bool, corte con precisión de fotograma) |
| `mute-video` | Silenciar vídeo | - |
| `video-to-gif` | Vídeo a GIF | `fps` (1-30), `width`, `startS`, `durationS` (máx. 60 s) |
| `resize-video` | Redimensionar vídeo | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Recortar vídeo | `width`, `height`, `x`, `y` |
| `rotate-video` | Rotar vídeo | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Cambiar FPS | `fps` (1-120) |
| `video-color` | Color de vídeo | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Velocidad de vídeo | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Invertir vídeo | - (máx. 5 minutos) |
| `video-loudnorm` | Normalizar audio | - (EBU R128) |
| `aspect-pad` | Relleno de proporción | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Relleno con desenfoque | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Marca de agua en vídeo | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Estabilizar vídeo | `smoothing` (5-60, en fotogramas) |
| `gif-to-video` | GIF a vídeo | `format` (mp4/webm/mov) |
| `video-to-webp` | Vídeo a WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Vídeo a fotogramas | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Combinar vídeos | - (varios archivos, normalizados a la resolución del primer vídeo) |
| `replace-audio` | Reemplazar audio | - (archivo de vídeo + audio, dos archivos) |
| `burn-subtitles` | Incrustar subtítulos | `fontSize` (8-72) - archivo de vídeo + subtítulos |
| `embed-subtitles` | Insertar subtítulos | `language` (código ISO 639-2/B) - archivo de vídeo + subtítulos |
| `extract-subtitles` | Extraer subtítulos | - (genera SRT) |
| `images-to-video` | Imágenes a vídeo | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - varios archivos |
| `video-metadata` | Limpiar metadatos de vídeo | - |
| `auto-subtitles` | Subtítulos automáticos (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extraer audio | `format` (mp3/wav/m4a/ogg) |

### Herramientas de audio {#audio-tools}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `convert-audio` | Convertir audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Recortar audio | `startS`, `endS` |
| `volume-adjust` | Ajustar volumen | `gainDb` (-30 a 30) |
| `normalize-audio` | Normalizar audio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Fundido de audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Invertir audio | - |
| `audio-speed` | Velocidad de audio | `factor` (0.25-4) |
| `pitch-shift` | Cambio de tono | `semitones` (-12 a 12) |
| `audio-channels` | Canales de audio | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Eliminación de silencios | `thresholdDb` (-80 a -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Reducción de ruido | `strength` (light/medium/strong) |
| `merge-audio` | Combinar audio | `format` (mp3/wav/flac/m4a) - varios archivos |
| `split-audio` | Dividir audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Creador de tonos de llamada | `startS`, `durationS` (1-30) |
| `waveform-image` | Imagen de forma de onda | `width`, `height`, `color` (hex) |
| `audio-metadata` | Metadatos de audio | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transcribir audio (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Herramientas de documentos {#document-tools}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `merge-pdf` | Combinar PDF | - (varios archivos, hasta 20 PDF) |
| `split-pdf` | Dividir PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Comprimir PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Rotar PDF | `angle` (90/180/270), `range` (intervalo de páginas) |
| `extract-pages` | Extraer páginas | `range` (sintaxis de qpdf, p. ej. "1-5,8,10-z") |
| `remove-pages` | Eliminar páginas | `pages` (intervalo de qpdf a eliminar) |
| `organize-pdf` | Organizar PDF | `order` (orden de páginas de qpdf, p. ej. "3,1,2,5-z") |
| `protect-pdf` | Proteger PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Desbloquear PDF | `password` |
| `repair-pdf` | Reparar PDF | - |
| `linearize-pdf` | Optimizar PDF para web | - (lineariza para una visualización web rápida) |
| `grayscale-pdf` | PDF en escala de grises | - |
| `pdfa-convert` | Convertir a PDF/A | - (PDF/A-2 de archivo) |
| `crop-pdf` | Recortar PDF | `margin` (0-2000 puntos) |
| `nup-pdf` | PDF N-up | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Folleto PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Marca de agua en PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Números de página en PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Aplanar PDF | - (fija formularios y anotaciones) |
| `redact-pdf` | Censurar PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Firmar PDF | Ruta multipart personalizada con PDF `file`, archivos de firma `sig0`, `sig1` y matriz JSON `placements` |
| `pdf-to-text` | PDF a texto | - |
| `pdf-to-word` | PDF a Word | - |
| `pdf-metadata` | Metadatos de PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Convertir documento | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Convertir presentación | `format` (pptx/odp) |
| `convert-spreadsheet` | Convertir hoja de cálculo | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel a PDF | - |
| `word-to-pdf` | Word a PDF | - |
| `powerpoint-to-pdf` | PowerPoint a PDF | - |
| `html-to-pdf` | HTML a PDF | - (recursos remotos deshabilitados) |
| `markdown-to-docx` | Markdown a Word | - |
| `markdown-to-html` | Markdown a HTML | - |
| `markdown-to-pdf` | Markdown a PDF | - (recursos remotos deshabilitados) |
| `epub-convert` | Convertir EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Convertir a EPUB | - (acepta .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR de PDF (IA) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF a imagen | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF a JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF a PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF a TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Herramientas de archivos {#file-tools}

| ID de herramienta | Nombre | Ajustes clave |
|---------|------|-------------|
| `chart-maker` | Creador de gráficos | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV a Excel | `sheet` (número de hoja de cálculo para entrada XLSX) - bidireccional |
| `csv-json` | CSV a JSON | `pretty` (bool) - bidireccional |
| `json-xml` | JSON a XML | `pretty` (bool) - bidireccional |
| `split-csv` | Dividir CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Combinar CSV | - (varios archivos, columnas coincidentes) |
| `yaml-json` | YAML / JSON | - (bidireccional) |
| `xml-to-csv` | XML a CSV | - (encuentra automáticamente elementos repetidos) |
| `excel-to-csv` | Excel a CSV | ajuste preestablecido de conversión dedicado respaldado por `convert-spreadsheet` |
| `create-zip` | Crear ZIP | - (varios archivos, 2-50 archivos) |
| `extract-zip` | Extraer ZIP | - (protegido contra bombas) |

### HTML a imagen {#html-to-image}

Captura una página web como imagen. A diferencia de otras herramientas, este endpoint acepta `application/json` en lugar de datos de formulario multipart (no se necesita subir ningún archivo).

**Endpoint:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parámetro | Tipo | Predeterminado | Descripción |
|-----------|------|---------|-------------|
| `url` | string | (obligatorio) | URL a capturar (solo http/https) |
| `format` | string | `"png"` | Formato de salida: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Calidad 1-100 (solo JPG/WebP) |
| `fullPage` | boolean | `false` | Capturar la página completa con desplazamiento |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Ancho de viewport personalizado 320-3840 |
| `viewportHeight` | number | `720` | Alto de viewport personalizado 320-2160 |

**Ejemplo:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Respuesta:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Subrutas de herramientas {#tool-sub-routes}

Algunas herramientas exponen endpoints adicionales más allá del estándar `POST /api/v1/tools/<section>/<toolId>`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Devuelve los ID de las herramientas populares, recurriendo a una lista predeterminada curada cuando hay pocos datos de uso |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Aplica efectos de fondo (color/gradient/blur/shadow) sin volver a ejecutar la IA. Usa la máscara en caché de la eliminación inicial. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Lee los metadatos EXIF/IPTC/XMP existentes de una imagen |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Inspecciona los campos de metadatos antes de eliminarlos |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Fase 1: detección de rostros con IA + eliminación de fondo. Devuelve los puntos de referencia faciales y datos en caché. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Fase 2: recorta, redimensiona y coloca en mosaico usando el análisis en caché. Sin volver a ejecutar la IA. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Obtiene los metadatos del GIF (número de fotogramas, dimensiones, duración) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Obtiene los metadatos del PDF (número de páginas, dimensiones) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Genera una vista previa de una página específica del PDF |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Obtiene los metadatos del PDF para el ajuste preestablecido JPG dedicado |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Genera una vista previa de página de PDF del ajuste preestablecido JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Obtiene los metadatos del PDF para el ajuste preestablecido PNG dedicado |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Genera una vista previa de página de PDF del ajuste preestablecido PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Obtiene los metadatos del PDF para el ajuste preestablecido TIFF dedicado |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Genera una vista previa de página de PDF del ajuste preestablecido TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Convierte por lotes varios SVG a ráster |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analiza la calidad de la imagen y devuelve recomendaciones de mejora |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Vista previa ligera para el ajuste de parámetros en vivo. Devuelve una imagen optimizada con cabeceras de tamaño. |

## Procesamiento por lotes {#batch-processing}

Aplica una herramienta genérica compatible con lotes a varios archivos a la vez. Devuelve un archivo ZIP. Las rutas personalizadas de varios archivos o de varios pasos, como la firma de PDF, el OCR de PDF y las rutas de ajustes preestablecidos de PDF a imagen, usan su propio contrato de endpoint en lugar de la ruta genérica `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

La concurrencia se controla mediante `CONCURRENT_JOBS` (predeterminado: detectado automáticamente a partir de los núcleos de la CPU). `MAX_BATCH_SIZE` limita el número de archivos por lote (predeterminado: 100; establece 0 para ilimitado).

## Canalizaciones {#pipelines}

### Ejecutar una canalización {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

La salida de cada paso es la entrada del siguiente. Las canalizaciones permiten 20 pasos de forma predeterminada, configurable mediante `MAX_PIPELINE_STEPS`. Establece `MAX_PIPELINE_STEPS=0` para quitar el límite.

### Guardar y gestionar canalizaciones {#save-and-manage-pipelines}

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Guarda una canalización con nombre (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Lista las canalizaciones guardadas (los administradores ven todas; los usuarios ven las propias) |
| `DELETE` | `/api/v1/pipeline/:id` | Elimina (propietario o administrador) |
| `GET` | `/api/v1/pipeline/tools` | Lista los ID de herramienta válidos para los pasos de la canalización |

## Seguimiento del progreso {#progress-tracking}

Los trabajos de larga duración, las herramientas encoladas, los trabajos por lotes y las canalizaciones emiten el progreso en tiempo real mediante Server-Sent Events. El flujo de progreso es público y se identifica por el ID del trabajo, por lo que los clientes no necesitan enviar una cabecera de autorización para leerlo.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Formato del evento:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Puedes solicitar la cancelación de un trabajo encolado o en ejecución con `POST /api/v1/jobs/:jobId/cancel`. La respuesta es `{"canceled":true|false}`.

## Biblioteca de archivos {#file-library}

Almacenamiento persistente de archivos con historial de versiones.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Sube archivos al espacio de trabajo (procesamiento temporal) |
| `POST` | `/api/v1/files/upload` | Sube archivos a la biblioteca de archivos persistente |
| `POST` | `/api/v1/files/save-result` | Guarda el resultado del procesamiento de una herramienta como una nueva versión de archivo |
| `GET` | `/api/v1/files` | Lista los archivos guardados (paginado, con búsqueda) |
| `GET` | `/api/v1/files/:id` | Obtiene los metadatos del archivo + la cadena de versiones |
| `GET` | `/api/v1/files/:id/download` | Descarga el archivo |
| `GET` | `/api/v1/files/:id/thumbnail` | Obtiene una miniatura JPEG de 300 px |
| `DELETE` | `/api/v1/files` | Elimina en bloque archivos y sus cadenas de versiones (cuerpo: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Obtiene URL remotas hacia el espacio de trabajo para importaciones basadas en URL |
| `POST` | `/api/v1/preview` | Genera una vista previa WebP compatible con el navegador (para formatos HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Transmite una vista previa en caché o generada compatible con el navegador para un PDF, documento de office, vídeo o archivo de audio guardado |
| `POST` | `/api/v1/preview/generate` | Genera una vista previa MP4 o MP3 bajo demanda para un archivo multimedia subido sin guardarlo primero |
| `GET` | `/api/v1/download/:jobId/:filename` | Descarga un archivo procesado desde un espacio de trabajo |

Para guardar automáticamente el resultado de una herramienta en la biblioteca, incluye `fileId` como campo de formulario multipart que haga referencia a un archivo existente de la biblioteca. El resultado procesado se guardará como una nueva versión.

## Gestión de claves de API {#api-key-management}

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Genera una clave nueva - se muestra una vez |
| `GET` | `/api/v1/api-keys` | Auth | Lista las claves (nombre, id, lastUsedAt - no la clave sin procesar) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Elimina una clave |

## Equipos {#teams}

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Lista los equipos |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Crea un equipo |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Renombra un equipo |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Elimina un equipo (no se puede eliminar el equipo predeterminado ni equipos con miembros) |

## Ajustes {#settings}

Configuración clave-valor en tiempo de ejecución (la lee cualquier usuario autenticado, solo la escribe un administrador).

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Obtiene todos los ajustes |
| `PUT` | `/api/v1/settings` | Actualiza ajustes en bloque (cuerpo JSON con pares clave-valor) |
| `GET` | `/api/v1/settings/:key` | Obtiene un ajuste específico por clave |

Claves conocidas: `disabledTools` (matriz JSON de ID de herramienta), `enableExperimentalTools` (cadena bool), `loginAttemptLimit` (número).

## Preferencias {#preferences}

Las preferencias por usuario son independientes de los ajustes de la instancia. Cualquier usuario autenticado puede leer y actualizar su propio mapa de preferencias.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Obtiene las preferencias del usuario actual como `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Inserta o actualiza una o más claves de preferencia para el usuario actual |

## Roles {#roles}

Gestión de roles personalizados con permisos granulares.

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Lista todos los roles con los recuentos de usuarios |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Crea un rol personalizado (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Actualiza un rol personalizado (no se pueden modificar los roles integrados) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Elimina un rol personalizado (no se pueden eliminar los roles integrados; los usuarios afectados vuelven al rol `user`) |

Permisos disponibles (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Registro de auditoría {#audit-log}

Endpoint solo para administradores para revisar acciones relevantes para la seguridad.

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Registro de auditoría paginado con filtros opcionales |

Parámetros de consulta:

| Parámetro | Descripción |
|-----------|-------------|
| `page` | Número de página (predeterminado: 1) |
| `limit` | Entradas por página (predeterminado: 50, máx.: 100) |
| `action` | Filtrar por tipo de acción (p. ej. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtrar por dirección IP de origen |
| `from` | Filtrar las entradas posteriores a esta fecha ISO 8601 |
| `to` | Filtrar las entradas anteriores a esta fecha ISO 8601 |

## Analítica {#analytics}

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Público | Obtiene la configuración de analítica efectiva (clave de PostHog, DSN de Sentry, tasa de muestreo). Las claves, el DSN y el ID de instancia están vacíos cuando la analítica está desactivada, ya sea por el bake en tiempo de compilación o por el ajuste `analyticsEnabled` de la instancia. |
| `POST` | `/api/v1/feedback` | Auth | Envía comentarios explícitos del usuario al proyecto de PostHog configurado como `feedback_submitted`. La ruta respeta la puerta de analítica, limita la frecuencia de los envíos, elimina los campos de contacto salvo que `contactOk` sea true y nunca acepta contenidos de archivos, nombres de archivos, rutas de subida ni texto de error privado en bruto. Cuando la analítica está desactivada, devuelve `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Establece la exclusión voluntaria a nivel de toda la instancia. Envía un cuerpo JSON `{ "analyticsEnabled": "false" }` para desactivar la analítica para todos, o `"true"` para volver a activarla. |

## Funciones / Paquetes de IA {#features-ai-bundles}

Gestiona los paquetes de funciones de IA (instalar/desinstalar paquetes de modelos de IA en el entorno de Docker).

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Lista todos los paquetes de funciones y su estado de instalación |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Instala un paquete de funciones (asíncrono, devuelve `jobId` para el seguimiento del progreso) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Desinstala un paquete de funciones y limpia los archivos de modelos |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Obtiene el uso total de disco de los modelos de IA |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Importa un archivo de paquete de IA sin conexión |

## Operaciones de administración {#admin-operations}

Endpoints operativos para observabilidad, soporte, informes de uso y estado de las copias de seguridad.

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Lee el nivel de registro actual en tiempo de ejecución |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Cambia el nivel de registro en tiempo de ejecución (`fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Métricas de Prometheus en formato de texto |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Descarga un paquete de soporte de diagnóstico redactado en ZIP |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Datos del panel de uso, con el parámetro de consulta opcional `days` |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Lee los metadatos de la última copia de seguridad y su estado de actualización |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Registra una copia de seguridad completada (`type`, `sizeBytes` opcional, `notes` opcional) |

## API empresariales {#enterprise-apis}

Estas rutas están limitadas por licencia según su función empresarial relacionada. Aun así requieren el permiso de SnapOtter indicado.

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Exporta las entradas de auditoría como JSON o CSV con filtros |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Exporta la configuración de la instancia, los roles personalizados y los equipos, redactados |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Importa la configuración, con simulación opcional |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Lee la lista de permitidos CIDR configurada |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Actualiza la lista de permitidos CIDR con prevención de autobloqueo |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Lista las retenciones legales de usuarios y equipos |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Aplica o libera una retención legal sobre un usuario o equipo |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Genera un token bearer de SCIM, devuelto una sola vez |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Revoca el token bearer de SCIM actual |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Lee la configuración de reenvío a SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Actualiza la configuración de reenvío a SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Lista los destinos de webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Crea un destino de webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Actualiza un destino de webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Elimina un destino de webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Envía una carga útil de webhook de prueba |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Inicia un trabajo de exportación de usuario GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Lee el estado de la exportación GDPR y la URL de descarga |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Purga permanentemente los datos de un usuario tras la confirmación |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Purga permanentemente los datos de un equipo tras la confirmación |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Lee los metadatos de versión de la aplicación, la compilación, Node y el esquema |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Compara las migraciones empaquetadas con las migraciones aplicadas |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Ejecuta comprobaciones de preparación para la actualización |

### SCIM 2.0 {#scim-2-0}

Los endpoints de descubrimiento de SCIM son públicos. Los endpoints de usuarios y grupos requieren el token bearer de SCIM generado arriba.

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Público | Capacidades del servidor SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Público | Descubrimiento de esquemas SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Público | Descubrimiento de tipos de recursos SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Token SCIM | Lista los usuarios, con un filtro SCIM opcional |
| `POST` | `/api/v1/scim/v2/Users` | Token SCIM | Crea un usuario |
| `GET` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Obtiene un usuario |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Reemplaza un usuario |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Desactiva de forma temporal un usuario |
| `GET` | `/api/v1/scim/v2/Groups` | Token SCIM | Lista los equipos como grupos SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Token SCIM | Crea un equipo |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Obtiene un equipo |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Reemplaza un equipo y la pertenencia al grupo |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Elimina un equipo |

## Plantillas de memes {#meme-templates}

API de apoyo para la herramienta de generación de memes.

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Lista todas las plantillas de memes disponibles con las posiciones de los cuadros de texto |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Sirve la imagen de la plantilla a tamaño completo |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Sirve la miniatura de la plantilla |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Sirve el archivo de fuente usado para renderizar el texto del meme |

## Respuestas de error {#error-responses}

Todos los errores devuelven JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Estado | Significado |
|--------|---------|
| 400 | Solicitud no válida / validación fallida |
| 401 | Sin autenticar |
| 403 | Permisos insuficientes |
| 404 | Recurso no encontrado |
| 413 | Archivo demasiado grande (consulta `MAX_UPLOAD_SIZE_MB`) |
| 422 | El procesamiento falló tras la validación |
| 429 | Frecuencia limitada (consulta `RATE_LIMIT_PER_MIN`) |
| 501 | El paquete de funciones de IA requerido no está instalado (`FEATURE_NOT_INSTALLED`) |
| 500 | Error interno del servidor |
