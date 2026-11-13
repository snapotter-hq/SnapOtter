---
description: "Qué datos de uso anónimos recopila SnapOtter, cuándo se envían y cómo desactivar la analítica de producto en toda la instancia."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: 5173e3a675e6
i18n_hash_version: 2
---

# Qué recopila SnapOtter {#what-snapotter-collects}

La analítica de producto anónima está activada por defecto y la establece un administrador para toda la instancia. Desactívala en Settings > System > Privacy.

## Eventos que enviamos (cuando está habilitada) {#events-we-send-when-enabled}

- tool_used: id de la herramienta, estado, duración, categoría, si es una herramienta de IA, y un código de error en caso de fallo.
- pipeline_executed: número de pasos, ids de herramientas, indicador de lote, número de archivos, duración, estado.
- ai_bundle_action: id del paquete, acción, duración.
- Uso del frontend: qué páginas de herramientas se abren, archivos añadidos (solo recuentos), herramienta iniciada, descargas, guardados, búsqueda (solo el número de resultados), lotes procesados.
- Informes de fallos: tipo de error, un mensaje de error depurado (sin nombres de archivo, rutas, correos electrónicos ni valores entre comillas), una pila de origen con los nombres base de los archivos y, para las herramientas de IA, un traceback de Python solo con los nombres base de los archivos.

## Lo que nunca recopilamos {#what-we-never-collect}

- Nombres o rutas de archivo
- Contenido de los archivos
- Texto de salida de OCR
- Metadatos de imagen (EXIF)
- Texto extraído de documentos
- La identidad de tu cuenta

PostHog ve la dirección IP de la que procede cada solicitud, como cualquier servidor. Nuestro proyecto de PostHog la descarta en lugar de almacenarla, y los eventos del propio servidor de SnapOtter envían un valor de relleno en su lugar.

## Avisos de actualización {#update-notices}

Mientras la analítica esté activada, el servidor consulta a PostHog cada pocas horas cuál es la versión más reciente de SnapOtter, usando el identificador anónimo de la instancia y su versión. Cuando hay una versión más nueva, los administradores ven un aviso con un enlace a las notas de la versión. Si lo cierras, permanece oculto hasta la siguiente versión. No se instala ni se descarga nada por ti, y con la analítica desactivada el servidor nunca pregunta.

## Desactivarla {#turning-it-off}

Administradores: Settings > System > Privacy, desactiva "Anonymous Product Analytics". Se detiene de inmediato, en toda la instancia. Para construir una imagen que nunca pueda emitir datos, establece el build arg `SNAPOTTER_ANALYTICS=off`.

Para iniciar una instancia nueva con la analítica ya desactivada, añade `SNAPOTTER_ANALYTICS_DEFAULT=off` al entorno del servidor antes de su primer arranque. Con Docker Compose, ponlo en el `environment:` del servicio de la aplicación, porque definirlo solo en `.env` no llega al contenedor.
