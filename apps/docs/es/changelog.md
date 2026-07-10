---
description: "Notas de la versión e historial de versiones de SnapOtter. Descubre las novedades, mejoras y correcciones de cada versión."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 16c08a97941e
---

# Registro de cambios {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 convierte el kit de herramientas de imagen en una suite completa de manipulación de archivos: más de 200 herramientas en cinco modalidades (Imagen, Vídeo, Audio, PDF y Archivos), reconstruida sobre Postgres 17 y una cola de tareas respaldada por Redis, con un `docker run` de un solo comando. Esta es una versión mayor; lee Cambios incompatibles antes de actualizar desde la 1.x.

### Nuevas funciones {#new-features}

- **Cuatro nuevas modalidades de herramientas**: Vídeo, Audio, PDF y Archivos se suman a Imagen, elevando el catálogo a más de 200 herramientas.
- **Tareas en segundo plano duraderas**: Una cola respaldada por Redis (BullMQ) ejecuta cada herramienta como una tarea rastreada con progreso SSE en vivo.
- **Modo de contenedor único todo en uno**: Un solo `docker run` arranca una instancia completa con Postgres y Redis embebidos.
- **Paquetes de IA bajo demanda**: Eliminación de fondo, OCR, transcripción, escalado, detección y mejora de rostros, borrado de objetos, colorización y restauración de fotos se instalan desde la interfaz. La aceleración por GPU se detecta por framework.
- **Firmar PDF**: Dibuja, escribe o sube una firma y colócala en un PDF desde el navegador.
- **Automatizar**: Un constructor visual de canalizaciones que encadena herramientas, con nueve plantillas predefinidas.
- **83 preajustes de conversión con un clic**: Conversores dedicados de JPG a PNG, MP4 a GIF y similares con búsqueda difusa.
- **Editor de imágenes basado en capas**: Un editor impulsado por Konva en `/editor` con pinceles, formas, ajustes, filtros y curvas.
- **Biblioteca de Archivos**: Guarda cualquier resultado y reutilízalo como entrada para otra herramienta.
- Herramientas ancladas, zoom y desplazamiento en el lienzo, 21 idiomas y capacidades empresariales (OIDC/SSO, SAML, SCIM, almacenamiento S3, permisos por herramienta, exportación de auditoría, trazado distribuido).

### Mejoras {#improvements}

- Cancela un proceso en ejecución. (#137)
- Decodificación RAW a resolución completa mediante LibRaw, incluido DNG. (#289)
- Despliegues sin root y con UID ajeno (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Detección precisa de instalaciones de IA y un flujo de instalación reforzado. (#214, #352)
- Refuerzo de la privacidad: sin salida automática a terceros, más un modo estrictamente sin conexión opcional.
- Botón de comentarios siempre visible, incluso con la analítica desactivada.

### Correcciones de errores {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` vuelve a desactivar la limitación de tasa para las rutas de herramientas. (#271)
- Rutas del entorno virtual de IA reparadas dentro de la imagen de Docker. (#390)
- Compatibilidad con sharp 0.35.2+. (#362)
- Correcciones de diseño del editor de imágenes: reglas, comportamiento del relleno, barra lateral y dimensionamiento del lienzo. (#258, #259)
- Traducción al italiano completada. (#231, #206, #425)
- La normalización de audio y loudnorm conservan la frecuencia de muestreo de origen.
- Refuerzo contra SSRF: coincidencia numérica de CIDR IPv6 y un preanálisis de URL ampliado. (#287)
- Los PDF generados llevan a SnapOtter estampado como Producer.
- mediapipe se instala en Python 3.13 y Debian 13.

### Cambios incompatibles {#breaking-changes}

2.0 reemplaza la base de datos SQLite embebida por Postgres 17 y añade Redis 8 para la cola de tareas. Tus datos de la 1.x se migran automáticamente en el primer arranque, pero la pila de contenedores cambió, así que haz primero una copia de seguridad de todo tu volumen `/data` (la 1.x ejecuta SQLite en modo WAL, por lo que los datos confirmados suelen residir en `snapotter.db-wal`). Luego elige la imagen de contenedor único (Postgres y Redis embebidos, solo root) o la pila de Compose (app más Postgres 17 y Redis 8). Consulta la [guía de migración](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) y la [guía de actualización](/es/guide/upgrading).

### Actualizar {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

O con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diferencias completas en GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nueva herramienta HTML a Imagen, accesibilidad WCAG 2.2 AA, refuerzo de seguridad tras pruebas de penetración y 5 correcciones críticas de Docker.

### Nuevas funciones {#new-features-1}

- **HTML a Imagen**: Captura pantallas de URL o HTML en bruto como PNG/JPEG/WebP. Capturas de página completa, viewports personalizados, modo oscuro.
- **Convención de secretos _FILE de Docker**: Monta variables de entorno sensibles como archivos en lugar de texto plano. (#205)
- **Licenciamiento empresarial y almacenamiento S3**: Clave de licencia comercial opcional y almacenamiento de objetos compatible con S3.
- **Mejoras del editor de formas**: Transparencia de relleno/trazo, selector de color RGBA, estilos de línea discontinua.
- **Archivos de lanzamiento precompilados**: Descarga tarballs de GitHub Releases para instalaciones sin Docker (Proxmox, hardware físico, LXC). (#202)

### Mejoras {#improvements-1}

- **Accesibilidad WCAG 2.2 AA**: Saltar navegación, captura de foco, regiones aria-live, soporte de movimiento reducido, ratios de contraste correctos. (#209)
- **Adaptabilidad móvil**: Ajustes adaptables, reconexión automática de SSE al cambiar de pestaña en móvil. (#203, #204)
- **Calidad de la eliminación de fondo**: Suavizado de bordes, descontaminación de color, selección del formato de salida.
- **Traducción al italiano**: ~145 cadenas nuevas por @albanobattistella. (#206)
- **Documentación de API por herramienta**: 53 páginas de documentación con parámetros, ejemplos y formatos de respuesta.
- **Descargas de modelos de IA**: Lógica de reintento con retroceso exponencial para HuggingFace. (#201)

### Correcciones de errores {#bug-fixes-1}

- Los contenedores Docker recién creados quedaban completamente inutilizables (el límite de tasa bloqueaba todas las solicitudes).
- Las herramientas de IA de detección de rostros (blur-faces, red-eye-removal, enhance-faces, passport-photo) fallaban en todas las plataformas.
- Archivos HEIC rotos en ARM (desajuste de símbolos de libheif).
- Los paquetes de IA de escalado y restore-photo no se instalaban en ARM.
- OCR usaba la versión incorrecta de CUDA en contenedores con GPU.
- Elusión de la protección SSRF mediante direcciones IPv6 mapeadas a IPv4 en hexadecimal. (Crédito: @tonghuaroot)
- Decodificación de HEIC de iPhone con imágenes auxiliares. (#183, #199)
- Falta de memoria de CUDA en Real-ESRGAN en GPU de 8 GB. (#200)
- 6 errores de producción en Sentry y 7 fallos de QA. (#208)

### Seguridad {#security}

- 10 hallazgos de pruebas de penetración resueltos (elusión de XFF, fallos por JSON malformado, canalizaciones sin límite, XSS en el registro de auditoría, método TRACE y más). (#207)
- Elusión de SSRF con IPv6 hexadecimal bloqueada. (Crédito: @tonghuaroot)
- Imágenes base del Dockerfile ancladas por digest.

### Actualizar {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

O con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diferencias completas en GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demo en vivo, páginas de aterrizaje por herramienta y un lote de correcciones de pulido.

### Nuevas funciones {#new-features-2}

- **Demo en vivo** - [demo.snapotter.com](https://demo.snapotter.com) permite probar SnapOtter sin instalar nada.
- **Página índice de herramientas** - Explora las más de 50 herramientas en `/tools` con búsqueda y filtros por categoría.
- **Más de 50 páginas de aterrizaje SEO** - Cada herramienta tiene ahora una página de aterrizaje dedicada con preguntas frecuentes, casos de uso y tablas comparativas.
- **Vista previa del fondo** - Un control deslizante de antes y después muestra un fondo a cuadros detrás de las imágenes transparentes.
- **Generador de contraseñas seguras** - Botón de un clic en el formulario de Añadir miembros.

### Correcciones de errores {#bug-fixes-2}

- La herramienta de información HEIC/HEIF ya no falla (se añadió una predecodificación).
- La instalación de paquetes de modelos de IA muestra mejores mensajes de error y respeta los límites de recursos.
- Las miniaturas de la biblioteca se cargan correctamente (faltaban las cabeceras de autenticación).
- Los menús desplegables ya no se recortan en las tablas de ajustes de Personas y Equipos.
- Porcentaje de comparación de tamaño oculto en las herramientas que no son de compresión.
- Enlace duplicado a la política de privacidad eliminado.
- Traducción al italiano añadida para los ajustes de las funciones de IA.
- Iconos de Lucide renombrados actualizados (Wand2, Columns).

### Infraestructura {#infrastructure}

- OpenSSF Scorecard reforzado de 4.3 a ~7.0.
- Pruebas de CI paralelizadas en 4 fragmentos con fixtures reducidas.
- 41 actualizaciones de dependencias.

### Actualizar {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

O con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diferencias completas en GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinco herramientas nuevas, un editor de imágenes completo, inicio de sesión SSO, 20 idiomas. Probablemente debería haber sido tres versiones separadas, pero aquí estamos.

### Nuevas funciones {#new-features-3}

- **Editor de imágenes** - Capas, pinceles, formas, ajustes, filtros, curvas, atajos de teclado. Se ejecuta en tu navegador y procesa en tu hardware.
- **Autenticación OIDC / SSO** - Inicia sesión con Google, GitHub, Okta o cualquier proveedor de OpenID Connect. Configura unas cuantas variables de entorno y tu equipo usa sus cuentas existentes.
- **Generador de memes** - 100 plantillas integradas con renderizado de texto mediante opentype.js. O sube tu propia imagen.
- **Embellecer** - Suelta una captura de pantalla y obtén una imagen pulida. Marcos de dispositivo (macOS, Windows, navegador), sombras, degradados, preajustes para redes sociales.
- **Simulación de daltonismo** - Previsualiza cómo se ven las imágenes con protanopía, deuteranopía, tritanopía y otras deficiencias de visión del color.
- **Reparador de transparencia PNG** - Detecta PNG con falsa transparencia y los corrige con matting de alta resolución de BiRefNet. Eliminación de marca de agua opcional mediante inpainting de LaMa.
- **Expansión de lienzo por IA** - Extiende los límites de la imagen con relleno de IA. Tres niveles de calidad (rápido, equilibrado, calidad) según cuánto tiempo de GPU quieras invertir.
- **20 idiomas** - Árabe, chino (simplificado/tradicional), checo, neerlandés, francés, alemán, hindi, indonesio, italiano, japonés, coreano, polaco, portugués, ruso, español, tailandés, turco, ucraniano, vietnamita. RTL funciona para el árabe.
- **Importación por URL** - Pega URL en la zona de arrastre o impórtalas en masa desde una lista. Descarga del lado del servidor con protección SSRF.
- **Borrador multiarchivo** - Dibuja máscaras de borrado en varias imágenes y procésalas todas con un clic. Los trazos persisten por imagen.
- **Importación/exportación de canalizaciones** - Guarda cadenas de herramientas como JSON y compártelas con otros.
- **17 nuevos formatos RAW de cámara** mediante exiftool, más entrada QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ y APNG. Nuevos códecs de salida para BMP, ICO, JP2, QOI. Exportación a AVIF, TIFF, GIF, JXL y PSD recuperada de una rama perdida anteriormente.

### Mejoras {#improvements-2}

- **Mejora de imagen** - Se reemplazó la canalización antigua por CLAHE + normalise + gamma. El nuevo interruptor Deep Enhance usa el modelo de IA para resultados más agresivos.
- **Restaurar foto** - Detección de arañazos reescrita con filtrado Otsu de 8 ángulos. El inpainting de LaMa ahora se ejecuta a resolución nativa.
- **Formatos exóticos en todas partes** - OCR, imagen a PDF, generador de favicon, composición, unión y vectorización ahora decodifican HEIC, RAW y PSD.
- **Comprimir** - Tolerancia de tamaño objetivo ajustada del 5% al 1%. El tamaño objetivo es el modo predeterminado. Se añadieron botones de paso y un selector de unidad KB/MB.
- **Limpieza de Sentry** - 644 eventos no accionables filtrados. Los errores reales ahora se gestionan correctamente.
- **Detección de GPU** - Mejores diagnósticos para contenedores donde CUDA está presente pero nvidia-smi no.
- **Modo con autenticación desactivada** - Se siembra un usuario anónimo en la BD con rol de administrador. Las claves de API, canalizaciones y archivos de usuario ya no se rompen por restricciones de clave foránea.
- **Más de 2.705 pruebas nuevas** entre unitarias, de integración y E2E.

### Correcciones de errores {#bug-fixes-3}

- El escalado en CPU ya no agota el tiempo de espera en equipos NAS y hardware de baja potencia.
- El logotipo del código QR ya no hace que la vista previa desaparezca permanentemente.
- Desbordamiento del recorte corregido para imágenes de retrato altas.
- Los archivos TIFF con alfa fuerzan correctamente la salida PNG en lugar de producir corrupción.
- La decodificación de HDR/EXR convierte a 8 bits antes de CLAHE, corrigiendo los fallos de decodificación.
- Los búferes de entrada de puntos de referencia faciales se convierten a PNG antes del sidecar de Python, corrigiendo los fallos.
- La búsqueda de duplicados gestiona lotes de formato mixto y errores de red.
- La vista previa de Embellecer se actualiza en tiempo real.
- Barras de progreso para unión y vectorización.
- SVGZ gestionado por SVG a ráster.
- Nombres de archivo no ASCII corregidos mediante la cabecera X-File-Results codificada en porcentaje.

### Actualizar {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

O con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diferencias completas en GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Imagen de Docker unificada con autodetección de GPU. Una sola imagen gestiona cargas de trabajo tanto de CPU como de GPU. Compose simplificado a un único archivo con rotación de registros. Las predescargas de modelos ahora incluyen verificación y una prueba de humo.

---

## v1.13.0 {#v1-13-0}

Control de acceso basado en roles (RBAC). 14 permisos granulares, tres roles integrados (administrador, editor, usuario), soporte de roles personalizados. Comprobaciones de permisos en todas las rutas de la API. Pestañas del frontend filtradas por los permisos del usuario.

---

## v1.12.0 {#v1-12-0}

Herramienta PDF a Imagen. Convierte páginas de PDF a PNG, JPEG, WebP o TIFF a un DPI personalizado. Imagen de Docker unificada con autodetección de GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt autogenerado mediante vitepress-plugin-llms para documentación compatible con IA.

---

## v1.10.0 {#v1-10-0}

Redimensionado con reconocimiento de contenido (seam carving) con protección de rostros. Redimensiona imágenes preservando el contenido importante.

---

## v1.9.0 {#v1-9-0}

Herramienta Unir / Combinar. Junta imágenes lado a lado, apiladas verticalmente o en una cuadrícula personalizada.

---

## v1.8.0 {#v1-8-0}

Herramienta Editar metadatos. Visualiza y edita metadatos EXIF, IPTC y XMP con una interfaz granular para eliminar/conservar.

---

## Versiones anteriores {#older-releases}

Para ver el registro de cambios completo a nivel de commit, incluidas las versiones de parche, consulta [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
