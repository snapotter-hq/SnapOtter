---
description: "Notas de la versión e historial de versiones de SnapOtter. Descubre las novedades, mejoras y correcciones de cada versión."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: d1b147f6557a
---

# Registro de cambios {#changelog}

## v2.2.0 {#v2-2-0}

La mayor parte de la 2.2 es endurecimiento. Un usuario no administrador con un rol delegado `users:manage` podía tomar el control de una instancia, y todos los endpoints de herramientas resultaron no tener su comprobación de permisos. Actualiza si tienes más de un usuario.

El resto es la cola larga del autoalojamiento: descargas que empezaban y nunca terminaban, preajustes que se rompían en cuanto añadías un segundo archivo, contenedores que entraban en bucle de fallos mientras Postgres aún se estaba iniciando. También llegaron dos herramientas nuevas. La documentación y el sitio web están ahora traducidos a 21 idiomas, y la interfaz por fin cumple el contraste WCAG AA.

> [!IMPORTANT]
> Si concediste `users:manage` a un usuario no administrador mediante un rol personalizado, ese rol podía tomar el control de cuentas de administrador en la 2.0.0 a la 2.1.0. Los detalles están en Seguridad.

### Seguridad {#v2-2-0-security}

- **Escalada de privilegios mediante un rol delegado `users:manage` (GHSA-9xgh-95qh-2x7h).** Un usuario no administrador que tuviera `users:manage` a través de un rol personalizado podía restablecer la contraseña de una cuenta con más privilegios, o eliminarla, incluida una cuenta de administrador integrada, y tomar el control de la instancia. El restablecimiento de contraseña y la eliminación de cuentas ahora verifican la autoridad de quien llama sobre el objetivo, así que un rol delegado no puede alcanzar por encima de su propio nivel. Afectadas: 2.0.0 a 2.1.0. Informado por 李春来 (Chunlai Li). (#616)
- **Todos los endpoints de herramientas están ahora protegidos.** El acceso a las herramientas se aplicaba ruta por ruta, así que las 45 rutas escritas a mano tenían que recordar la misma llamada y ninguna lo hacía. Un rol sin `tools:use` todavía podía ejecutar image-to-pdf, erase-object, upscale, sign-pdf y el resto. La comprobación ahora vive en un único preHandler vinculado a la ruta coincidente, así que cubre subrutas y cualquier ruta añadida después. (#646)
- **La limitación de tasa se podía eludir en instalaciones Docker.** La imagen incluía `TRUST_PROXY=true`, así que la IP del cliente procedía de una cabecera de solicitud y un `X-Forwarded-For` falsificado se saltaba el limitador de inicio de sesión. El valor predeterminado ahora es una lista de confianza de redes privadas. (#649)
- **Las escrituras de ajustes se comprueban por ajuste**, no una vez en la puerta, y la importación de configuración ahora es transaccional, de modo que una clave rechazada no puede dejar media configuración aplicada. (#618)
- **Los nombres de archivo de la biblioteca no pueden escapar de su raíz de almacenamiento.** Un nombre almacenado manipulado, que una importación maliciosa de SQLite de la 1.x copia tal cual, podía leer o eliminar archivos fuera del directorio de archivos. Solo es alcanzable después de que un operador importe una base de datos SQLite de la 1.x proporcionada por un atacante, que es la única vía que permite elegir un nombre almacenado. Informado por @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **La cancelación de tareas exige propiedad**, así que un usuario autenticado ya no puede cancelar la tarea de otro usuario por su id. Informado por @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Una nueva auditoría de todo el árbol de la 2.0 encontró lo que seguía abierto**: una aserción SAML capturada se podía reproducir, un desafío MFA sobrevivía a cualquier número de códigos erróneos, la búsqueda de claves de API por solicitud era un escaneo completo de la tabla, `MAX_WORKSPACE_SIZE_GB` era configuración muerta y el saneador de SVG dejaba pasar hrefs `javascript:` sin comillas. (#620)
- **Nueve CVE divulgadas parcheadas**: fast-uri, svgo, sharp y tar de forma transitiva (#619), más Pillow 12.3.0 (#517). La decodificación RAW en arm64 ahora compila LibRaw 0.22.2 desde el código fuente en lugar de enlazar una copia del sistema sin parchear. (#649)

### Nuevas funciones {#v2-2-0-new-features}

- **Recorte redondeado**: máscaras de cuadrado redondeado y squircle al estilo iOS, con un control de radio de esquina. Pensado para favicons e iconos de aplicaciones. (#602)
- **Eliminar fondo de GIF**: quita el fondo de un GIF animado, WebP o APNG fotograma a fotograma y obtén una animación transparente. (#502)
- **Lazo y modo de alta calidad en el borrador de objetos**: arrastra un bucle de forma libre en lugar de pintar cada píxel y, opcionalmente, instala un paquete de inpainting por difusión para rellenos más limpios en áreas grandes. (#503, #566)
- **Guardar como nuevo o sobrescribir.** Editar un archivo de la biblioteca solía reemplazar el original en silencio. Ahora eliges en cada edición, y el valor predeterminado lo conserva. (#564, #577)
- **Preajustes de relación de aspecto en Redimensionar.** Elige 1:1, 4:3 o 16:9 y las dos dimensiones permanecen bloqueadas, sin ampliar. (#530)
- **OCR de dos niveles**: un nivel rápido está integrado en la imagen y se ejecuta sin conexión sin descargas, y un tiempo de ejecución más preciso se instala bajo demanda. (#519)
- **Escribe en cualquier lugar para buscar.** Empieza a escribir en el panel o en la página de inicio y el texto acaba en la caja de búsqueda. (#644)
- **Documentación y sitio web en 21 idiomas**: el sitio de documentación, las páginas de inicio y la referencia de la API están ahora todos traducidos, sumándose a la interfaz de la aplicación. Una nueva guía de despliegue de bajos recursos cubre Raspberry Pi y máquinas de 2 GB. (#548)
- **Nombres de herramientas más claros**: 18 nombres ambiguos ahora se autocalifican, así que "Compress" pasó a ser "Compress Image". Los ids y las rutas de las herramientas no cambian, así que nada de lo que tengas en marcadores se rompe. (#520)

### Mejoras {#v2-2-0-improvements}

- **Contraste WCAG AA en toda la interfaz**: la paleta se ajustó para que el naranja vivo permanezca en los rellenos mientras el texto y las etiquetas usan tokens de tinta accesibles, y los 57 indicadores de foco ahora superan el umbral de 3:1 para elementos no textuales. (#567, #574)
- **El escalado y la eliminación de fondo dejan de parecer congelados**: la barra de progreso avanza durante la inferencia en lugar de quedarse en el 30 %, y ambas herramientas ahora advierten de que un host solo con CPU es mucho más lento. (#605, #608)
- **Los mensajes de tiempo de espera nombran la causa real** y tienen en cuenta los hosts solo con CPU en lugar de culpar a la subida. (#596)
- **SnapOtter espera a Postgres y Redis al arrancar** en lugar de entrar en un bucle de fallos, tanto en Compose como en la imagen todo en uno. Una instalación en Proxmox LXC se reiniciaba 76 veces antes de esto. (#537, #595)
- **Las descargas sobreviven a un proxy inverso**: SnapOtter pide a nginx y a los proxies compatibles que no almacenen en búfer las respuestas de archivos, que suele ser la razón de que una descarga autoalojada empiece y nunca termine. (#604, #607)
- **Comprimir PDF se acerca al tamaño objetivo**, y lo dice con honestidad cuando un objetivo es inalcanzable. (#522)
- **Los controles de herramientas en móvil siguen accesibles** ahora que los armazones de la aplicación se dimensionan según la ventana gráfica dinámica. (#559)
- **Convertir audio expone un ajuste de frecuencia de muestreo.** (#561)
- **Los administradores pueden relajar la longitud mínima de contraseña**, hasta 1 para una instancia en una LAN de confianza. (#543)
- **MFA es de autoservicio**, el bloqueo por la política está corregido, y los inicios de sesión OIDC o SAML reciben un desafío MFA real en lugar de un bloqueo total. (#531, #536)
- **Un `Error: Error` escueto ahora nombra su causa.** Los fallos de codificación de Sharp, las salidas del sidecar de IA, la salida no JSON del sidecar de documentos y los fallos de eliminación de fondo llegaban antes con el motivo borrado. (#532, #534, #535, #538, #612)
- **El diálogo de ayuda está traducido.** Sus etiquetas de atajos y el texto de introducción estaban fijados en inglés mientras las traducciones terminadas estaban sin usar en los 21 archivos de idioma. (#647)

### Correcciones de errores {#v2-2-0-bug-fixes}

- **Los archivos HEIC de iPhone eran rechazados** como ilegibles antes de llegar al decodificador que los maneja. (#631)
- **Los preajustes de conversión fallaban con un segundo archivo**: jpg-to-pdf y sus variantes image-to-pdf, además de pdf-to-png, pdf-to-jpg y pdf-to-tiff, devolvían todos `Tool not found` en cuanto subías dos archivos. (#633, #643)
- **Los preajustes de conversión de PDF perdieron su botón de descarga.** (#629)
- **Un tiempo de espera de procesamiento ilimitado no se respetaba**, y los flujos de progreso estancados ahora se recuperan en lugar de dejar la interfaz esperando. (#638)
- **Las descargas se colgaban en lugar de fallar** cuando un archivo almacenado resultaba ser más corto que su longitud registrada. (#617)
- **Las herramientas de páginas de PDF fallaban con archivos cortos y cifrados**: Eliminar páginas usaba por defecto un rango de páginas que ningún documento de menos de seis páginas tiene, y los PDF protegidos con contraseña fallaban de forma críptica dentro del worker. (#594)
- **PDF a texto devolvía silenciosamente un archivo vacío** en PDF escaneados. Ahora te remite al OCR y sirve el texto como UTF-8. (#603)
- **PDF a Word perdía los bloques de texto en color** y los dividía por la página. (#500)
- **El borrador de objetos dejaba restos fantasma** y difuminaba objetos pequeños en imágenes de alta resolución. (#501)
- **Estabilizar vídeo escribía una salida no reproducible** sin faststart. (#593)
- **Reparaciones del editor de imágenes**: rotar, voltear, redimensionar, niveles, curvas, filtros y bloqueo de capas. (#597)
- **Firmar PDF mostraba un lienzo en blanco** en lugar de explicar por qué un PDF no se podía cargar. (#545)
- **La biblioteca de archivos registraba dimensiones 0x0** y omitía las vistas previas de las subidas HEIC, RAW y PSD. (#636, #637)
- **Instalar más de un paquete de IA** dejaba el entorno virtual compartido con varias versiones y rompía silenciosamente tres herramientas. (#649)
- **Convertir a JXL con calidad 1 a 4 devolvía un 500**, y un ffmpeg ausente se informaba como una subida corrupta. (#649)
- **Una interrupción transitoria de Postgres dejaba tareas terminadas varadas**, con la salida en disco sin ninguna fila que la apuntara. Un reconciliador ahora adopta ese trabajo en lugar de descartarlo. (#649)
- **Un endpoint de Redis que cambiaba de dirección atascaba a todos los consumidores** mientras las comprobaciones de estado seguían respondiendo 200. (#649)
- **Correcciones del sitio web y la documentación**: los enlaces localizados ya no pierden fragmentos `#` ni convierten `zh-CN` a minúsculas, la navegación de la documentación permanece dentro de la ventana gráfica en tablets, y ninguno de los dos sitios llama ya a la API de GitHub desde tu navegador. (#516, #562, #570, #560)

### Notas de actualización {#v2-2-0-upgrade-notes}

Nada que migrar, pero cambiaron dos valores predeterminados incluidos:

- **`TRUST_PROXY` ahora tiene como valor predeterminado `loopback,linklocal,uniquelocal`** en lugar de confiar en todos los pares. La red puente de Docker y las redes de Compose están dentro de ese rango, así que la mayoría de las configuraciones no necesitan cambios. Si tu proxy inverso llega a SnapOtter desde una dirección pública, establece `TRUST_PROXY` explícitamente, o la limitación de tasa y los registros de auditoría atribuirán cada solicitud al proxy.
- **`MAX_AI_JOBS_PER_USER` tiene como valor predeterminado 5** tareas de IA de un solo archivo en curso por usuario. Las ejecuciones de IA por lotes y de canalizaciones siguen sin límite.

Nuevos ajustes opcionales: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (desactivado de forma predeterminada) y `GIF_BG_MAX_FRAMES`.

### Agradecimientos {#v2-2-0-acknowledgements}

Buena parte de esta versión empezó como el informe de error de otra persona.

Código y contribuciones:

- **@mvanhorn** ❤️: Reescribió el fallo de tiempo de espera de la eliminación de fondo como un mensaje que dice qué hacer al respecto, en lugar de un tiempo de espera escueto. (#518, #494)
- **@EuanTop** ❤️: Restauró la acción de descarga en las páginas de preajustes de conversión de PDF haciendo que la ruta síncrona devolviera el contrato estándar de resultado de herramienta. (#629, #623)
- **@harshjainnn** ❤️: Diagnosticó la descarga que empieza y nunca termina, y propuso la dirección de restablecimiento de socket sobre la que se construyó la corrección. (#617, #590)

Divulgaciones de seguridad:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Divulgó de forma privada la escalada de privilegios mediante un rol delegado `users:manage`, con un análisis completo de origen a destino y una cadena de explotación funcional. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Divulgó un IDOR autenticado en la cancelación de tareas, y un path traversal en los nombres de archivo almacenados de la biblioteca alcanzable tras una importación maliciosa de SQLite de la 1.x, con una prueba de concepto funcional para cada uno. (#599, #600)

Informes de errores:

- **@riz467** ❤️: Archivos HEIC reales de iPhone rechazados en la validación, con la causa raíz esclarecida en el informe. (#622)
- **@coupej** ❤️: Páginas de preajustes de PDF que se colgaban para siempre, y jpg-to-pdf fallando en cuanto se añadía un segundo archivo. Dos errores distintos, separados correctamente. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documentado como ilimitado pero limitado a cinco minutos. (#630)
- **@bezibaerchen** ❤️: Convertir audio ocultaba el ajuste de frecuencia de muestreo que prometía su propia descripción. (#558)
- **@hell-toupee** ❤️: El paquete OCR preciso fallando al instalarse con un error de `libpaddle`. (#505)
- **@Michael1260** ❤️ y **@And-CSH** ❤️: Confirmaron ese fallo de instalación de OCR de forma independiente y establecieron que la extracción manual funciona mientras el instalador de la aplicación no, lo que situó el error en el instalador. (#505)
- **@TomErnst1972** ❤️: Activar la política de MFA obligatoria dejaba a un administrador fuera de su propia instancia. (#515)
- **@thokich** ❤️: El borrado de objetos producía rellenos borrosos e inutilizables, lo que impulsó tanto la reescritura del inpainting HD como el paquete opcional de alta calidad. (#141)
- **@Hennie-git** ❤️: Una instalación en Proxmox LXC que se reiniciaba 76 veces contra un Postgres que aún no aceptaba conexiones. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Clasificó ese informe en tiempo real y produjo el diagnóstico sobre el que se construyó la corrección del arranque. (#537)

Solicitudes de funciones y comentarios:

- **@LECOQQ** ❤️: Pidió relajar la complejidad de las contraseñas en una instalación de servidor doméstico. (#136)
- **@killervette42** ❤️: Pidió una aplicación comunitaria para Unraid, ahora publicada en la tienda Unraid CA. (#96)
- **@alienatedsec** ❤️: Señaló que la corrección de la GPU que recurre a la CPU estaba enterrada en un issue cerrado y era imposible de descubrir, y por eso ahora está en la documentación de despliegue. (#490, #587)
- **@neilp316** ❤️: Confirmó el fallo de GPU Blackwell en una RTX 5060 y trazó una ruta de actualización funcional a CUDA 12.8. (#120)
- **@Roiki11** ❤️: Defendió el almacenamiento compartido con referencias de ruta frente a la transferencia de archivos por HTTP para el cómputo de IA fuera del equipo. (#189)

Gracias también a los miembros de la comunidad que informaron de estos casos por Discord y correo electrónico, cuyos nombres no registramos: la solicitud de recorte squircle (#602), la descarga de image-to-PDF que empezaba y nunca terminaba (#604, #607), la herramienta Eliminar páginas que se quedaba atascada (#594), el texto árabe ausente en pdf-to-text (#603) y el diagnóstico detrás del fallback de GPU de ONNX (#490).

[Diferencia completa en GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
