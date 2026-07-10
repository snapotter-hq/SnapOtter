---
description: "Qué datos de uso anónimos recopila SnapOtter, cuándo se envían y cómo desactivar la analítica de producto en toda la instancia."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 85728242faf2
---

# Qué recopila SnapOtter {#what-snapotter-collects}

La analítica de producto anónima está activada por defecto y la establece un administrador para toda la instancia. Desactívala en Settings > System > Privacy.

## Eventos que enviamos (cuando está habilitada) {#events-we-send-when-enabled}

- tool_used: id de la herramienta, estado, duración, categoría, si es una herramienta de IA, y un código de error en caso de fallo.
- pipeline_executed: número de pasos, ids de herramientas, indicador de lote, número de archivos, duración, estado.
- ai_bundle_action: id del paquete, acción, duración.
- Uso del frontend: qué páginas de herramientas se abren, archivos añadidos (solo recuentos), herramienta iniciada, descargas, guardados, búsqueda (solo el número de resultados), lotes procesados.
- Informes de fallos: tipo de error y una pila de origen solo con los nombres base de los archivos.

## Lo que nunca recopilamos {#what-we-never-collect}

- Nombres o rutas de archivo
- Contenido de los archivos
- Texto de salida de OCR
- Metadatos de imagen (EXIF)
- Texto extraído de documentos
- Tu dirección IP o la identidad de tu cuenta

## Desactivarla {#turning-it-off}

Administradores: Settings > System > Privacy, desactiva "Anonymous Product Analytics". Se detiene de inmediato, en toda la instancia. Para construir una imagen que nunca pueda emitir datos, establece el build arg `SNAPOTTER_ANALYTICS=off`.
