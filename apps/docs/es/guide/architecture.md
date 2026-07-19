---
description: "Estructura del monorepo, arquitectura de aplicaciones y paquetes, ciclo de vida de las solicitudes y huella de recursos de SnapOtter."
i18n_output_hash: 95af8eadf83e
i18n_source_hash: a53946e760b0
i18n_provenance: human
---

# Arquitectura {#architecture}

SnapOtter es un monorepo gestionado con espacios de trabajo de pnpm y Turborepo. Se despliega como una pila de Docker Compose de 3 contenedores: la imagen de la app de SnapOtter, PostgreSQL 17 y Redis 8.

## Estructura del proyecto {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Paquetes {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

La biblioteca principal de procesamiento de imágenes construida sobre [Sharp](https://sharp.pixelplumbing.com/). Gestiona todas las operaciones que no son de IA: redimensionar, recortar, rotar, voltear, convertir, comprimir, eliminar metadatos y ajustes de color (brillo, contraste, saturación, escala de grises, sepia, invertir, canales de color).

Este paquete no tiene dependencias de red y se ejecuta enteramente en el proceso.

### `@snapotter/ai` {#snapotter-ai}

Una capa puente que llama a los tiempos de ejecución nativos y Python ML. La mayoría de las herramientas Python utilizan un dispatcher persistente que preimporta bibliotecas pesadas (PIL, NumPy, MediaPipe, rembg) para que las llamadas posteriores omitan la sobrecarga de importación. OCR está aislado de ese entorno compartido mutable: `fast` invoca Tesseract nativo, mientras que `balanced` y `best` utilizan un JSONL dispatcher persistente dedicado anclado a la generación activa e inmutable RapidOCR/ONNX. Cada solicitud contiene un generation lease. La activación primero ejecuta un smoke test en un candidato y luego cambia atómicamente a su dispatcher. Los drenajes dispatcher anteriores antes de su generación se recolectan como basura.

**Los modelos no se precargan.** Cada script de herramienta carga sus pesos de modelo desde el disco en el momento de la solicitud y los descarta cuando la solicitud finaliza. Consulta [Huella de recursos](#resource-footprint) para ver el perfil de memoria completo.

Operaciones soportadas: eliminación de fondo (rembg/BiRefNet), ampliación (RealESRGAN), desenfoque de cara (MediaPipe), mejora facial (GFPGAN/CodeFormer), borrado de objetos (LaMa ONNX), OCR (Tesseract y RapidOCR con modelos PP-OCR ONNX), coloración (DDColor), eliminación de ruido, eliminación de ojos rojos, restauración de fotografías, generación de fotos de pasaporte, fijación de transparencias (estera BiRefNet HR), y cambio de tamaño según el contenido (Go caire binario).

Los scripts Python viven en `packages/ai/python/`. Se instalan grandes paquetes de modelos opcionales según demanda en el volumen persistente `/data/ai`. Accurate OCR utiliza artefactos firmados y específicos de la plataforma; el nivel Tesseract integrado no requiere la descarga del paquete de modelos.

### `@snapotter/shared` {#snapotter-shared}

Tipos de TypeScript compartidos, constantes (como `APP_VERSION` y definiciones de herramientas) y cadenas de traducción i18n usadas tanto por el frontend como por el backend.

## Aplicaciones {#applications}

### API (`apps/api`) {#api-apps-api}

Un servidor Fastify v5 que expone 241 rutas de herramientas en cinco modalidades (imagen, vídeo, audio, PDF, archivo) y que gestiona:
- Subidas de archivos, gestión del espacio de trabajo temporal y almacenamiento persistente de archivos
- Biblioteca de archivos de usuario (tabla `user_files`): una edición guardada se almacena de forma predeterminada como un nuevo archivo independiente, o como una versión enlazada a su padre cuando sobrescribes el original. Registra qué herramientas se aplicaron (`toolChain`) y obtiene una miniatura autogenerada para la página de Archivos
- Ejecución de herramientas (dirige cada solicitud de herramienta al motor de imágenes o al puente de IA)
- Orquestación de canalizaciones (encadenado de varias herramientas de forma secuencial)
- Procesamiento por lotes con control de concurrencia mediante colas de tareas de BullMQ (pools: image, media, ai, docs, system)
- Autenticación de usuarios, RBAC (roles de administrador/usuario con un conjunto completo de permisos), gestión de claves de API y limitación de tasa
- Gestión de equipos - CRUD solo para administradores; los usuarios se asignan a un equipo mediante el campo `team` en su perfil
- Ajustes de tiempo de ejecución - un almacén de clave-valor en la tabla `settings` que controla `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` y otras palancas operativas sin necesidad de redesplegar
- Personalización de marca y preferencias de tiempo de ejecución mediante ajustes respaldados por la base de datos
- Documentación Scalar/OpenAPI en `/api/docs`
- Servir el frontend compilado como una SPA en producción

Dependencias clave: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod para la validación.

El servidor gestiona un apagado ordenado ante SIGTERM/SIGINT: drena las conexiones HTTP, detiene los workers de BullMQ, apaga el despachador de Python y cierra la conexión a la base de datos.

### Web (`apps/web`) {#web-apps-web}

Una aplicación de página única de React 19 construida con Vite. Usa Zustand para la gestión de estado, Tailwind CSS v4 para el estilo y Lucide para los iconos. Se comunica con la API a través de REST y SSE (para el seguimiento del progreso).

Las páginas incluyen un espacio de trabajo de herramientas, una página de Archivos para gestionar subidas y resultados persistentes, un constructor de automatización/canalizaciones y un panel de ajustes de administrador.

El frontend compilado lo sirve el backend de Fastify en producción, por lo que no hay un servidor web separado en el contenedor de Docker.

### Docs (`apps/docs`) {#docs-apps-docs}

Este sitio de VitePress. Se despliega en Cloudflare Pages automáticamente al hacer push a `main`.

## Cómo fluye una solicitud {#how-a-request-flows}

1. El usuario elige una herramienta en la interfaz web y sube un archivo.
2. El frontend envía un POST multiparte a `/api/v1/tools/:section/:toolId` con el archivo y los ajustes.
3. La ruta de la API valida la entrada con Zod y luego despacha el procesamiento.
4. Para las herramientas estándar, la tarea se encola en el pool de BullMQ adecuado (image, media o docs según la modalidad). El worker de BullMQ en el proceso autoorienta la imagen según los metadatos EXIF, ejecuta la función de procesamiento de la herramienta y devuelve el resultado.
5. Para la mayoría de las herramientas de IA, el puente TypeScript envía una solicitud al Python dispatcher persistente. En cambio, el OCR rápido invoca a Tesseract, y el OCR preciso inicia el ejecutable anclado desde la generación OCR activa e inmutable. El nivel OCR solicitado se fija en el ingreso y nunca se cambia silenciosamente durante la ejecución.
6. El progreso de la tarea se persiste en la tabla `jobs` de PostgreSQL para que el estado sobreviva a los reinicios del contenedor. Las actualizaciones en tiempo real se entregan mediante SSE en `/api/v1/jobs/:jobId/progress`.
7. La API devuelve un `jobId` y un `downloadUrl`. El usuario descarga el archivo procesado desde `/api/v1/download/:jobId/:filename`.

Para las canalizaciones, la API alimenta la salida de cada paso como entrada del siguiente, ejecutándolos de forma secuencial.

Para el procesamiento por lotes, la API usa flujos de BullMQ con tareas hijas por paso y devuelve un archivo ZIP con todos los archivos procesados.

## Huella de recursos {#resource-footprint}

SnapOtter está diseñado para un bajo uso de memoria en reposo. Nada se precarga ni se mantiene en caliente al arrancar.

### En reposo {#at-idle}

El proceso de Node.js/Fastify, PostgreSQL y Redis están en ejecución. La RAM típica en reposo es de **~200-300 MB** entre los tres contenedores (proceso de Node.js, Postgres y Redis). Sin proceso de Python, sin pesos de modelo en memoria.

### Qué se inicia, y cuándo {#what-starts-and-when}

| Componente | Se inicia cuando | Memoria mientras está activo |
|-----------|-------------|---------------------|
| Servidor Fastify + Postgres + Redis | Arranque del contenedor | ~200-300 MB en total |
| Workers de BullMQ | Arranque del contenedor (en el proceso) | Un worker por pool (image, media, ai, docs, system) |
| Despachador de Python | Primera solicitud de herramienta de IA | Intérprete de Python + bibliotecas preimportadas (PIL, NumPy, MediaPipe, rembg) - sin pesos de modelo |
| Pesos de modelos de IA | Durante la solicitud de la herramienta específica | Cargados desde el disco, liberados cuando la solicitud finaliza |

### Carga de modelos {#model-loading}

Todos los archivos de pesos de los modelos (que suman varios GB) residen en el disco en `/opt/models/` en todo momento. Cada script de herramienta de IA carga en memoria solo su propio modelo (o modelos) durante la duración de una solicitud y luego los libera. Algunos scripts llaman explícitamente a `del model` y `torch.cuda.empty_cache()` tras la inferencia para asegurar que la memoria se devuelve de inmediato.

No hay caché de modelos entre solicitudes. Ejecutar la misma herramienta de IA de forma consecutiva recarga el modelo cada vez. Esto mantiene la memoria en reposo cercana a cero a costa de un retraso de carga de modelo en cada solicitud de IA.

### Arranque en frío de la primera solicitud de IA {#first-ai-request-cold-start}

El despachador de Python no está en ejecución cuando el contenedor arranca. La primera solicitud de IA desencadena dos cosas en paralelo: el despachador empieza a calentarse en segundo plano y la propia solicitud recurre al lanzamiento puntual de un subproceso de Python. Una vez que el despachador señala que está listo, todas las solicitudes de IA posteriores lo usan directamente y omiten el coste de lanzar el subproceso.
