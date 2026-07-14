---
description: "Extraiga texto de archivos PDF escaneados localmente con Tesseract integrado o el tiempo de ejecución opcional de alta precisión RapidOCR."
i18n_output_hash: f3e92ae150d4
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# OCR de PDF {#pdf-ocr}

Extraiga texto de documentos PDF escaneados página por página sin enviar el PDF a un servicio externo. El nivel `fast` integrado utiliza Tesseract. Los niveles opcionales `balanced` y `best` utilizan RapidOCR con modelos PP-OCR ONNX con clavijas.


<!-- korean-ocr-contract:start -->
::: info Compatibilidad del OCR coreano
OCR rápido admite `auto`, `en`, `de`, `es`, `fr`, `zh` y `ja`, pero no coreano (`ko`). El coreano requiere el paquete OCR preciso y `balanced` o `best`. El paquete funciona en los contenedores oficiales Linux amd64 y arm64, incluidos hosts NVIDIA, donde el OCR sigue usando la CPU. Los sistemas no compatibles reciben un error explícito y nunca vuelven silenciosamente a `fast`. Coreano con `fast` o el alias heredado `tesseract` se rechaza antes de encolarse con `FEATURE_INCOMPATIBLE` y `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings` opcional.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo PDF (multiparte), hasta 512 MiB codificados; todavía se aplica un límite de carga de operador más bajo |
| quality | string | No | Dinámica | Nivel de calidad OCR: `fast`, `balanced` o `best` |
| language | string | No | `"auto"` | Idioma del documento: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Selección de páginas, p. ej. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | No | Dependiente del nivel | Mejorar el contraste local antes del reconocimiento. Fast lo aplica directamente; Equilibrado y Mejor conservan la variante solo cuando la puntuación calibrada mejora el resultado. El valor predeterminado es `true` para `best` y `false` para `fast`/`balanced`. |
| engine | string | No | - | Alias ​​de compatibilidad obsoleto. Utilice `quality` en su lugar. `tesseract` se asigna a `fast`; el valor `paddleocr` heredado se asigna a `balanced` pero no carga PaddlePaddle |

Si se omiten `quality` y `engine`, SnapOtter elige el mejor nivel disponible en este orden: `best`, `balanced`, `fast`. Para coreano nunca elige `fast`: usa `best`, luego `balanced`, o devuelve el error de instalación o compatibilidad del entorno preciso.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Devuelve `202 Accepted`. Sigue el progreso mediante SSE en `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato de entrada aceptado: `.pdf`.
- `fast` está integrado y agrega alrededor de 25 MiB a la imagen oficial. `balanced` y `best` requieren el paquete OCR preciso opcional (alrededor de 208-234 MiB para descargar y 409-488 MiB instalado, según el objetivo).
- El paquete preciso admite Linux amd64 y arm64 y utiliza ONNX Runtime en CPU, incluidos los hosts NVIDIA.
- Un nivel solicitado explícitamente nunca se degrada silenciosamente. Si `balanced` o `best` no está disponible, API devuelve `501` con `FEATURE_NOT_INSTALLED` o `FEATURE_INCOMPATIBLE`.
- Las páginas PDF se rasterizan en alta resolución antes de OCR. `best` ejecuta los modelos PP-OCRv6 medios de mayor precisión y puntúa variantes de orientación y mejora, mejorando el reconocimiento a costa de la velocidad.
- La configuración de idioma `auto` permite el reconocimiento en todo el conjunto de scripts admitidos; una sugerencia explícita puede mejorar los resultados de un lenguaje de documento conocido.
- Puedes seleccionar páginas concretas mediante rangos (`"1-3"`), listas separadas por comas (`"1,3,5"`) o `"all"` para todas las páginas.
- Una solicitud puede procesar como máximo 50 páginas. Los datos borrador rasterizados tienen un límite de 512 MiB y la respuesta UTF-8 OCR agregada tiene un límite de 1.000.000 de bytes; los trabajos que exceden el límite fallan en lugar de devolver texto parcial.
- Para los PDF que ya contienen texto seleccionable, considera usar la herramienta más rápida [PDF a texto](./pdf-to-text) en su lugar.
