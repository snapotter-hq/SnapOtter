---
description: "Extraiga texto de imágenes localmente con Tesseract integrado o el tiempo de ejecución opcional RapidOCR de alta precisión."
i18n_output_hash: 216e5b55332d
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Extracción de texto {#ocr-text-extraction}

Extraiga texto de imágenes sin enviar la imagen a un servicio externo. El nivel `fast` integrado utiliza Tesseract. Los niveles opcionales `balanced` y `best` utilizan RapidOCR con modelos PP-OCR ONNX con clavijas.


<!-- korean-ocr-contract:start -->
::: info Compatibilidad del OCR coreano
OCR rápido admite `auto`, `en`, `de`, `es`, `fr`, `zh` y `ja`, pero no coreano (`ko`). El coreano requiere el paquete OCR preciso y `balanced` o `best`. El paquete funciona en los contenedores oficiales Linux amd64 y arm64, incluidos hosts NVIDIA, donde el OCR sigue usando la CPU. Los sistemas no compatibles reciben un error explícito y nunca vuelven silenciosamente a `fast`. Coreano con `fast` o el alias heredado `tesseract` se rechaza antes de encolarse con `FEATURE_INCOMPATIBLE` y `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Procesamiento:** El OCR siempre es asíncrono. Después de validar y poner el trabajo en cola, el endpoint devuelve inmediatamente `202 Accepted` con un `jobId`. Siga el flujo de progreso SSE del trabajo hasta su evento terminal `complete` o `failed`; el `result` de un evento correcto contiene los campos de OCR.

**Paquete OCR preciso:** Tiempo de ejecución `ocr` opcional (alrededor de 208-234 MiB para descargar y 409-488 MiB instalado, según el objetivo). `fast` no requiere este paquete; el instalador verifica los tamaños exactos vinculados por el índice firmado.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multiparte), hasta 512 MiB codificados y 40 megapíxeles decodificados; todavía se aplica un límite de carga de operador más bajo |
| quality | string | No | Dinámica | Nivel de calidad: `fast` (Tesseract), `balanced` (RapidOCR con los modelos pequeños PP-OCRv6), o `best` (los modelos PP-OCRv6 medios de mayor precisión con puntuación de variante calibrada) |
| language | string | No | `"auto"` | Sugerencia de idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | Dependiente del nivel | Mejorar el contraste local antes del reconocimiento. Fast lo aplica directamente; Equilibrado y Mejor conservan la variante solo cuando la puntuación calibrada mejora el resultado. El valor predeterminado es `true` para `best` y `false` para `fast`/`balanced`. |
| engine | string | No | - | Alias ​​de compatibilidad obsoleto. Utilice `quality` en su lugar. `tesseract` se asigna a `fast`; el valor `paddleocr` heredado se asigna a `balanced` pero no carga PaddlePaddle |

Si se omiten `quality` y `engine`, SnapOtter elige el mejor nivel disponible en este orden: `best`, `balanced`, `fast`. Para coreano nunca elige `fast`: usa `best`, luego `balanced`, o devuelve el error de instalación o compatibilidad del entorno preciso.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Respuesta aceptada (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progreso y resultado (SSE) {#progress-sse-optional}

Conéctese a `GET /api/v1/jobs/{jobId}/progress` con el `jobId` devuelto por la respuesta `202` (o el `clientJobId` proporcionado). Mantenga abierto el flujo hasta el evento terminal `complete` o `failed`. Un frame terminal correcto contiene la salida de OCR en `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

Los fallos de procesamiento llegan en el campo `error` del evento terminal `failed`; no se devuelven como HTTP `422` después de poner el trabajo en cola.

## Notas {#notes}

- `fast` siempre está disponible en imágenes SnapOtter compatibles. `balanced` y `best` requieren el paquete preciso OCR opcional.
- El Tesseract incorporado agrega alrededor de 25 MiB a la imagen oficial. El paquete exacto se almacena en `/data/ai`, no se integra en la imagen.
- Se publica el pack exacto para los contenedores oficiales Linux amd64 y arm64. Utiliza deliberadamente el proveedor CPU de ONNX Runtime, incluso en hosts NVIDIA, por lo que no depende de las bibliotecas CUDA ni de la compatibilidad con GPU. Las instalaciones de bare-metal de origen y prediseñadas utilizan Fast OCR a menos que proporcionen su propio tiempo de ejecución compatible.
- El `result` terminal correcto incluye tanto el texto extraído en `text` como un artefacto `.txt` descargable en `downloadUrl`.
- SnapOtter respeta un nivel solicitado explícitamente. Si `balanced` o `best` no está disponible, API devuelve `501` con `FEATURE_NOT_INSTALLED` o `FEATURE_INCOMPATIBLE`; nunca degrada silenciosamente la solicitud a otro nivel.
- Un resultado vacío exitoso sigue siendo un resultado vacío. Las fallas en tiempo de ejecución devuelven un error en lugar de volver a intentarlo con un motor de menor calidad.
- El `result` terminal correcto informa tanto `requestedQuality` como `actualQuality`, además del motor, dispositivo, proveedor, tiempo de ejecución y versiones del modelo, y cualquier advertencia.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
- Las entradas codificadas de gran tamaño devuelven `413`. Las imágenes de más de 40 megapíxeles y las respuestas de OCR que superen sus límites de salida se rechazan en lugar de procesarse parcialmente.
