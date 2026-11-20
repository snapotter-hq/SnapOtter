---
description: "Qué datos de uso anónimos recopila SnapOtter, cuándo se envían, cómo funciona la elección de la primera ejecución y cómo desactivar las analíticas de producto de toda la instancia."
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: 7656b794d467
i18n_hash_version: 2
---

# Qué recopila SnapOtter {#what-snapotter-collects}

Anonymous Product Analytics la configura un administrador para toda la instancia. Una instancia nueva pregunta en la primera ejecución y no envía nada hasta que alguien responde. Puedes cambiarlo en cualquier momento en Settings > System > Privacy.

Cuando las analíticas están activadas, SnapOtter envía a PostHog qué herramientas y pipelines se ejecutan, cuánto tardan, si terminan con éxito, los códigos de error y el número de archivos, junto con el ID anónimo de la instancia, su versión, la arquitectura de CPU, el sistema operativo, el tipo de instalación y si tiene GPU. Los informes de errores van a Sentry sin nombres de archivo, rutas, correos electrónicos ni valores entre comillas. Nunca envía tus archivos, sus nombres o rutas, su contenido, el resultado del OCR ni el texto extraído, los metadatos de imagen ni la identidad de tu cuenta. PostHog y Sentry son los únicos dos destinos a los que envía algo, y con las analíticas desactivadas no envía nada a ninguno de los dos.

- tool_used: id de la herramienta, estado, duración, categoría, si es una herramienta de IA, un código de error en caso de fallo y el nombre del paso cuando una herramienta informa de una etapa por separado (el paso de análisis de Passport Photo).
- pipeline_executed: número de pasos, ids de herramientas, indicador de lote, número de archivos, duración, estado.
- ai_bundle_action: id del paquete, acción (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), duración y, si la instalación falla, una categoría de fallo de una lista fija (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). Nunca se envían la salida del instalador, rutas ni mensajes de error.
- Uso del frontend: qué páginas de herramientas se abren, archivos añadidos (solo recuentos), herramienta iniciada, descargas, guardados, búsqueda (solo el número de resultados), lotes procesados.
- Informes de fallos: tipo de error, un mensaje de error depurado (sin nombres de archivo, rutas, correos electrónicos ni valores entre comillas), una pila de origen con los nombres base de los archivos y, para las herramientas de IA, un traceback de Python solo con los nombres base de los archivos.

## Lo que nunca recopilamos {#what-we-never-collect}

- Nombres o rutas de archivo
- Contenido de los archivos
- Texto resultante del OCR
- Metadatos de imagen (EXIF)
- Texto extraído de documentos
- La identidad de tu cuenta

PostHog ve la dirección IP desde la que llega cada solicitud, como cualquier servidor. Nuestro proyecto de PostHog la descarta en lugar de almacenarla, y los eventos del propio servidor de SnapOtter envían un marcador de posición en su lugar.

## Avisos de actualización {#update-notices}

Mientras las analíticas están activadas, el servidor pregunta a PostHog cada pocas horas cuál es la versión más reciente de SnapOtter, usando el ID anónimo de la instancia y su versión. Cuando existe una versión más reciente, los administradores ven un aviso con un enlace a las notas de la versión. Si lo descartas, permanece oculto hasta la siguiente versión. No se instala ni se descarga nada por ti, y con las analíticas desactivadas el servidor nunca pregunta.

## Cómo desactivarlo {#turning-it-off}

Administradores: Settings > System > Privacy, desactiva "Anonymous Product Analytics". Se detiene de inmediato, en toda la instancia. Para crear una imagen que nunca pueda emitir datos, define el argumento de compilación `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` en el entorno del servidor hace lo mismo en tiempo de ejecución y prevalece sobre cualquier respuesta guardada en la aplicación.

Para responder de antemano a la pregunta de la primera ejecución, añade `SNAPOTTER_ANALYTICS_DEFAULT=off` (o `on`) al entorno del servidor antes de su primer arranque y no se preguntará a nadie. Con Docker Compose, ponlo en `environment:` del servicio de la aplicación, porque definirlo solo en `.env` no llega al contenedor.
