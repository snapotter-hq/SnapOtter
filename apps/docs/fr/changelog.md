---
description: "Notas de versión e historial de versiones de SnapOtter. Vea qué hay de nuevo, qué se ha mejorado y qué se ha corregido en cada versión."
i18n_source_hash: 952098c65251
i18n_provenance: machine
i18n_output_hash: 602e483c0791
i18n_hash_version: 2
---

# Registro de cambios {#changelog}

## v2.3.0 {#v2-3-0}

SnapOtter acaba de superar el millón de descargas de imágenes entre Docker Hub y GHCR, y las 3,000 estrellas en GitHub. Son muchos servidores autoalojados, así que esta versión es nuestro agradecimiento a todos quienes los ejecutan.

Actualice pronto. 2.3.0 cierra seis avisos de seguridad, uno de ellos de gravedad alta. Los detalles están en la sección Seguridad más abajo.

Además de las correcciones, hay herramientas nuevas: un editor de páginas PDF Multi-Tool, ajustes preestablecidos de compresión a un tamaño objetivo con un clic para imágenes y PDF, y ordenación de páginas arrastrando y soltando en Organize PDF. OCR ahora lee árabe, y pdf-to-text ofrece OCR cuando encuentra un PDF escaneado. SnapOtter puede ejecutarse bajo una subruta como `/snapotter` detrás de un proxy inverso. La aplicación ya no necesita un superusuario de Postgres para funcionar. Los administradores que queden bloqueados pueden recuperar el acceso desde la línea de comandos. El resto son unas 1,400 correcciones, la mayoría de problemas que ustedes reportaron.

> [!IMPORTANT]
> Los seis avisos siguientes afectan a 2.2.0, y algunos se remontan a 2.0.0. Si comparte una instancia con otros usuarios o la expone fuera de su propia red, actualice.

### Seguridad {#v2-3-0-security}

- **Las cargas de SVG podían omitir el saneamiento (GHSA-9c7h-xjrp-8gh3, alta).** Un SVG que el decodificador de imágenes rechazaba se almacenaba y se servía tal cual en lugar de sanearse. Afectadas: 2.2.0 y anteriores. Reportado por @xaferima. (#1211)
- **El flujo de progreso de los trabajos no comprobaba quién preguntaba (GHSA-ff22-w6x2-fm98, media).** Ahora exige haber iniciado sesión y ser el propietario del trabajo. Afectadas: de 2.0.0 a 2.2.0. (#1750)
- **Los enlaces de descarga de resultados también servían la carga original (GHSA-jgv3-2jc6-f628, media).** Afectadas: 2.2.0 y anteriores. Reportado por @emirhancatkin. (#3623)
- **Las funciones de foto de pasaporte y de efectos de fondo confiaban en un ID de trabajo proporcionado por el cliente (GHSA-3c8g-8v4x-qq9j, media).** Afectadas: 2.2.0 y anteriores. Reportado por @shaoyuuuuu. (#3623)
- **La importación por URL, la carga y la vista previa omitían las comprobaciones de permisos de rol y de clave de API (GHSA-8xxr-g2w8-7f9r, media).** Afectadas: 2.2.0 y anteriores. Reportado por @nguyenvantiennani. (#3780, #707)
- **La exigencia de SSO revelaba el nombre de usuario de emergencia (GHSA-q6fg-vvw9-cr8r, baja).** Un inicio de sesión local rechazado ahora recibe el mismo 401 que cualquier otro inicio de sesión fallido. Afectadas: de 2.0.0 a 2.2.0. (#2148)
- **Postgres ya no se ejecuta como superusuario.** La aplicación ahora se conecta con un rol que solo puede leer y escribir datos. Las migraciones usan una conexión independiente y opcional. Consulte las Notas de actualización. (#918)
- **Dependencias parcheadas**: los mínimos de override de dompurify y handlebars se elevaron a las versiones corregidas. (#4247)

### Funciones nuevas {#v2-3-0-new-features}

- **PDF Multi-Tool**: un editor de páginas que reordena, duplica, gira y elimina páginas, e incorpora páginas de otros PDF. El servidor ensambla el archivo final. (#1338)
- **Comprimir a un tamaño objetivo con un clic**: cinco ajustes preestablecidos de imagen (20, 50, 100, 200, 500 KB) y cinco de PDF (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Ejecute SnapOtter bajo una subruta**: defina `BASE_PATH=/snapotter` y la misma imagen se sirve desde allí. Los enlaces de resultados, las cookies, las redirecciones de SSO y la documentación de la API la siguen. (#1252, #1324)
- **OCR en árabe**: elija árabe explícitamente, o deje que el modo automático lo detecte. Funciona con OCR de imágenes y de PDF. (#4130, #4183)
- **pdf-to-text ofrece OCR** cuando un PDF, o un lote completo, no tiene capa de texto, en lugar de devolver un archivo vacío. (#4142, #4198)
- **Ordenación de páginas arrastrando y soltando en Organize PDF**, con ratón y con pantalla táctil. (#1249, #2601)
- **Reordene archivos antes de una ejecución con varios archivos**: merge, stitch, collage y las demás herramientas de varios archivos respetan el orden que usted defina. (#756, #757)
- **Cancele ejecuciones por lotes y de pipelines**, y el trabajo realmente se detiene en el servidor. (#807)
- **Comandos de recuperación de `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user` y restablecimiento de MFA, para administradores bloqueados fuera de la interfaz web. (#4016)
- **Inscripción en MFA al iniciar sesión**: cuando se exige MFA, los usuarios que no la tienen la configuran en el momento en lugar de quedar bloqueados.
- **Captura con la cámara y una aplicación instalable**: tome una foto directamente hacia una herramienta en el móvil e instale SnapOtter como PWA. (#773)
- **Relleno transparente en el cuadro de diálogo Tamaño del lienzo del editor.** (#4111)
- **Avisos de actualización para administradores**: cuando hay una versión más reciente de SnapOtter, los administradores ven un aviso descartable con un enlace a las notas de la versión. La comprobación se realiza a través de la conexión de analítica existente, así que está desactivada cuando la analítica lo está.

### Mejoras {#v2-3-0-improvements}

- **La eliminación de fondo es más rápida en ejecuciones repetidas**: el modelo permanece cargado entre solicitudes en lugar de recargarse cada vez. (#4144)
- **Las cargas por lotes usan mucha menos memoria**: cada archivo se envía al disco temporal y se procesa de uno en uno en lugar de permanecer en la RAM. (#2687)
- **Las instalaciones de paquetes de IA fallan limpiamente y se revierten** en lugar de dejar un venv instalado a medias. Las instalaciones de eliminación de fondo en Proxmox LXC vuelven a funcionar, y los hosts con poca memoria reciben límites de CPU razonables antes de iniciar un trabajo. (#2628, #2597, #2526, #2546)
- **La detección de GPU es más fiable**: CUDA se detecta a través del controlador, las tarjetas de la serie RTX 50 recurren a la CPU en lugar de fallar, y los codificadores de vídeo por hardware se prueban antes de usarse. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` ahora funciona**. Se analizaba pero nunca se aplicaba. (#3249)
- **Las herramientas largas reciben el tiempo de espera largo**: pdf-to-word, compress-pdf, convert-document y el cambio de tamaño según el contenido ya no agotan el tiempo antes de lo debido con archivos grandes. (#3276)
- **Compress PDF mantiene legibles los escaneos**, e indica cuando no se puede alcanzar un tamaño objetivo en lugar de producir un archivo ilegible. (#4112)
- **Los inicios de sesión fallidos se limitan por nombre de usuario**: más de diez en quince minutos reciben un 429 con `Retry-After`. (#827)
- **Los errores indican qué salió mal**: los binarios ausentes, los fallos de almacenamiento, las terminaciones por falta de memoria y los límites de carga ahora reciben mensajes específicos en lugar de un 500 o un 422 sin detalle.
- **El registro de auditoría cubre las ejecuciones de herramientas, lotes y pipelines**, y los eventos de usuarios, roles, equipos y RGPD registran quién hizo qué a quién. (#3991, #3984)
- **El contenedor todo en uno se detiene ante un primer arranque fallido** en lugar de reiniciarse indefinidamente, y el Postgres y el Redis integrados tienen plazos de arranque. (#3008, #1130)
- **Las fechas y los plurales siguen su idioma**, y las últimas cadenas de inglés fijadas en el código están traducidas.
- **Mejoras para móvil y para el editor**: diseños del control deslizante, de Sign PDF y del recorte en teléfonos, arrastre táctil, pinceles de píxeles más rápidos, y Niveles y Curvas en deshacer y autoguardado.

### Correcciones de errores {#v2-3-0-bug-fixes}

- **Adjust Colors combinaba mal los ajustes**: temperatura, saturación, tono, contraste y sepia se anulaban entre sí en lugar de acumularse. (#3153, #3120, #3469)
- **Pixelate no pixelaba**, y la salida PNG se reducía silenciosamente de paleta en varias herramientas de imagen. (#709, #716)
- **Los GIF y WebP animados perdían fotogramas** en varias herramientas, y las paletas y la transparencia de los GIF salían mal. (#1184, #1225, #3407, #2573)
- **Las cargas giradas perdían calidad**: la orientación automática descartaba la codificación sin pérdida, la transparencia y la profundidad de 16 bits. El WebP animado ahora gira todos los fotogramas. (#2384, #2529)
- **Los TIFF con transparencia, los archivos HEIF con AV1 y varios formatos RAW** fallaban o perdían el canal alfa. (#2609, #2572, #1120)
- **Cambiar el tamaño del lienzo del editor escalaba la imagen** en lugar de añadir espacio a su alrededor. (#2081)
- **Los nombres de archivo de salida se alteraban**: `.jpeg` y `.tif` se convertían en otra cosa, y los archivos que empiezan por punto o los nombres que repiten su extensión fallaban. (#3495, #3382)
- **El autoguardado en la biblioteca ignoraba la cuota de almacenamiento**, y los contadores de almacenamiento podían volverse negativos. (#2389, #2585)
- **Los trabajos atascados tras un reinicio** ahora se resuelven al iniciar en lugar de mostrar "procesando" para siempre. (#3219, #3193)
- **El inicio de sesión con OIDC nombraba "admin" a todo usuario nuevo**, y los inicios de sesión en Safari de iOS terminaban en una página de error tras completarse con éxito. (#862, #4021)
- **Las reglas de contraseña desactivadas se seguían aplicando** al crear usuarios. (#1028)
- **Los PDF dañados se colgaban 30 segundos** antes de fallar. (#920)
- **La comprobación de disco del paquete de IA pedía unos 18 GB** para instalar un solo paquete. (#1248)
- **Compress Video fallaba con grabaciones de pantalla de velocidad de fotogramas variable.** (#2427)
- **La eliminación de fondo por lotes perdía resultados terminados** cuando el navegador reintentaba la solicitud. (#2015)
- **Los campos numéricos de Ajustes no se podían vaciar** mientras se escribía. (#1449)
- **Desactivar la analítica dejaba eventos en cola para enviarse** unos 30 segundos después. Ahora se descartan cuando usted opta por no participar. (#4270)

### Notas de actualización {#v2-3-0-upgrade-notes}

Las migraciones se ejecutan solas al iniciar. No necesita ejecutar ningún SQL.

- **Roles de base de datos.** El archivo Compose canónico ahora da a la aplicación un rol que solo puede leer y escribir datos (`DATABASE_URL`) y una conexión privilegiada independiente (`DATABASE_MIGRATION_URL`) que se usa solo durante el arranque para migraciones y permisos. Un archivo Compose existente sigue funcionando como antes: deje `DATABASE_MIGRATION_URL` sin definir y SnapOtter funciona con un solo rol. Para un despliegue no local, defina `POSTGRES_APP_PASSWORD` junto con `POSTGRES_PASSWORD`.
- **Comprobaciones de inicio más estrictas.** Antes fallaban más tarde, o en silencio. Ahora detienen el contenedor con un mensaje que nombra la variable: un `DEFAULT_LOCALE` no admitido (use un código admitido como `de`, no `de_DE`), un `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` o `OIDC_ISSUER_URL` mal formado cuando SSO está activado, una lista `TRUST_PROXY` no válida, un `BASE_PATH` incorrecto y un `LOG_DIR` no escribible.
- **`TRUST_PROXY` ya no acepta un número de saltos.** Un número como `TRUST_PROXY=2` ahora detiene el contenedor al iniciar en lugar de no confiar silenciosamente en ningún proxy. Defínalo con las direcciones del proxy o con rangos con nombre (el valor predeterminado es `loopback,linklocal,uniquelocal`), `false` cuando nada hace de proxy de SnapOtter, o `true` solo cuando un proxy bajo su control esté delante, en una dirección pública. (#998)
- **`MAX_WORKER_THREADS` ahora surte efecto.** Si lo definió y no vio ningún cambio antes, ahora lo verá.
- **Códigos de estado de la API.** Los fallos de motor y de almacenamiento devuelven 503 `ENGINE_UNAVAILABLE` (los endpoints por lotes devolvían 422). Las cargas que superan el límite devuelven 413 (antes 400). Un `clientJobId` mal formado devuelve 400 y uno reutilizado 409 (antes 500). Reproducir su propio lote de pipeline devuelve 202. `mode=targetSize` sin `targetSizeKb` devuelve 400. Un inicio de sesión local rechazado bajo la exigencia de SSO devuelve 401 en lugar de 403 `SSO_ENFORCED`. Los inicios de sesión limitados devuelven 429 `LOGIN_THROTTLED`. El resultado de remove-background ya no incluye `originalUrl`.
- **Nuevas variables opcionales**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 minutos por defecto, `0` lo desactiva), `EMBEDDED_REDIS_TIMEOUT_S` (180) y `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Los archivos Compose se distribuyen con la versión.** `docker-compose.yml` y `docker-compose-gpu.yml` se adjuntan a esta versión, de modo que puede descargarlos directamente desde la página de la versión.

### Agradecimientos {#v2-3-0-acknowledgements}

Un millón de descargas significa mucha gente reportando errores, enviando correcciones y diciéndonos lo que faltaba. Esta versión es en su mayor parte obra suya.

Código y contribuciones:

- **@zakka258** ❤️: Construyó el editor de páginas PDF Multi-Tool y el despliegue bajo subruta, dos de las funciones más grandes de esta versión, incluidas las pruebas de autenticación y SSO bajo una subruta. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Construyó los ajustes preestablecidos de compresión de imágenes a un tamaño objetivo con un clic, corrigió la concurrencia y la limpieza de las vistas previas, e impidió que el almacenamiento bloqueado del navegador dejara colgado el indicador de carga del inicio de sesión. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Añadió el reordenamiento de páginas arrastrando y soltando a Organize PDF, algo que había pedido antes en Discussions. (#1249, #965)
- **@drakeo338** ❤️: Diez correcciones en todo el conjunto, incluidas la orientación automática que conserva el formato y la calidad, los grupos SCIM creados en una sola transacción, las instalaciones de IA bajo cgroup v2, y los errores 5xx que ya no se enmascaran como 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Añadió el relleno transparente del lienzo al editor, corrigió los veredictos obsoletos del tamaño objetivo de Compress PDF y permitió actualizaciones parciales de equipos. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Impidió que las instancias autoalojadas enviaran datos de mapas de calor, validó `TRUST_PROXY` al iniciar en lugar de fallar, y corrigió el manejo de nombres de grupo de SCIM y de los tiempos de espera de qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Convirtió varios 500 en respuestas 400 y 409 adecuadas para ID de trabajo mal formados e importaciones multipart, y corrigió el vaciado de los campos numéricos en Ajustes. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Hizo que la lectura de códigos de barras funcione sin conexión al incluir su decodificador, corrigió las vistas previas de medios que mostraban la entrada y mejoró la búsqueda de formatos. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Reportó y corrigió el fallo de Compress Video con grabaciones de pantalla de velocidad de fotogramas variable. (#2426, #2427)
- **@dvd233** ❤️: Expuso todos los formatos RAW de cámara que admite el decodificador, y logró que las herramientas de favicon aparezcan al buscar ICO. (#1120, #1121)
- **@bercedev** ❤️: Corrigió los nombres de archivo cuyo nombre base repite la extensión, e hizo que la IA informe del dispositivo en el que realmente se ejecuta. (#3382, #3613)
- **@pamod-madubashana** ❤️: Tradujo el último encabezado de MFA que solo estaba en inglés y conectó las cadenas de progreso sin usar. (#1228, #1227)
- **@mvanhorn** ❤️: Corrigió la asignación duplicada de nombres de usuario en el inicio de sesión con SAML. (#2640)
- **@peremunoz** ❤️: Impidió que la generación de códigos de barras ocultara los fallos de almacenamiento y de memoria como "Texto no válido". (#4057)
- **@mayuriphad** ❤️: Corrigió un fallo con una cabecera de autenticación de alerta almacenada mal formada. (#3080)
- **@DevShoaib78** ❤️: Corrigió el cierre del lazo poligonal en el editor. (#1207)
- **@dltsum** ❤️: Trasladó las indicaciones de progreso al catálogo de mensajes compartido. (#1262)
- **@albanobattistella** ❤️: Correcciones de traducción. (#1024)
- **@shoaibyazdani** ❤️: Regeneró las referencias visuales de macOS. (#2475)

Divulgaciones de seguridad:

- **@xaferima** ❤️: Descubrió que los SVG rechazados por el decodificador omitían el saneamiento, y analizó el impacto junto con nosotros. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Descubrió que los enlaces de resultados también servían la carga original. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Descubrió que las funciones de foto de pasaporte y de efectos de fondo confiaban en un ID de trabajo proporcionado por el cliente. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Descubrió que la importación por URL omitía las comprobaciones de permisos. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Reportó elusiones mediante IPv6 de las comprobaciones de direcciones SSRF, con pruebas de concepto funcionales. Las correcciones se incluyeron en 2.0.0, y este agradecimiento se debía desde hace tiempo. (#287)

Reportes de errores:

- **@kabo** ❤️: El ejemplo de `docker-compose.yml` no funcionaba. (#1027)
- **@xromen** ❤️: PDF dañados que se colgaban hasta un tiempo de espera de qpdf de 30 segundos. (#920)
- **@snmabaur** ❤️: El inicio de sesión con OIDC que establecía todos los nombres de perfil como "admin". (#862)
- **@CodecNomad** ❤️: La herramienta Blur que duplicaba la imagen. (#829)
- **@ohora0923** ❤️ y **@Alexis-VS-CSharp** ❤️: Pixelate que no funcionaba. (#678, #775)
- **@mptpro** ❤️: La descarga de IA de eliminación de fondo que fallaba. (#714)
- **@dominic427** ❤️: Cambiar el tamaño del lienzo del editor escalaba la imagen en lugar de extenderla. (#2016)
- **@CodeByToast** ❤️: Campos numéricos de Ajustes que no se podían vaciar. (#1186)
- **@gioxx** ❤️: La comprobación de disco del paquete de IA que exigía unos 18 GB para un solo paquete. (#1248)
- **@rekcodocker** ❤️ y **@madmike970** ❤️: Instalaciones de paquetes de IA que fallaban en Proxmox LXC, con los detalles del contenedor que ayudaron a acotarlo. (#1030, #352)
- **@wxf26054** ❤️: Reglas de contraseña desactivadas que se seguían aplicando al crear usuarios. (#1028)
- **@ersil** ❤️: Safari de iOS que solicitaba dos veces el callback de OIDC y terminaba en una página de error tras un inicio de sesión exitoso. (#4021)
- **@casi-3** ❤️: La eliminación de fondo por lotes que perdía resultados terminados cuando el navegador reproducía la solicitud, con un diagnóstico preciso. (#2015)
- **@killervette42** ❤️: El fallo de la GPU Blackwell en unRaid, que dio lugar a la alternativa a CPU para la serie RTX 50. (#120, #4075)

Solicitudes de funciones y comentarios:

- **@photoevents** ❤️: Midió que la eliminación de fondo tardaba unos 11 segundos en cargar el modelo y 1 segundo en la inferencia, propuso almacenar sesiones en caché y compartió lo que había aprendido al ejecutar su propia caché. Eso se convirtió en la caché de sesiones de esta versión. (#768, #776, #4144)
- **@benbou8231** ❤️: Señaló que los archivos importados llegan en orden inverso a las herramientas de varios archivos, lo que condujo a poder reordenar antes de una ejecución. (#729, #756)
- **@cf3901646** ❤️: Rastreó un error ruidoso de producción hasta la clase de error 58 de Postgres y propuso la corrección. No pudimos fusionar su PR sin un CLA firmado, así que escribimos nosotros la misma corrección. (#4210, #4253)
- **@chiliec** ❤️: Detectó que una orientación automática fallida se ignoraba en silencio y que el progreso de la instalación ignoraba el catálogo de traducciones. Ambas propuestas se incorporaron mediante PR de los mantenedores. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Propuso unificar en un solo vuelo la importación del módulo enterprise, la corrección para que las solicitudes SCIM concurrentes dejaran de discrepar sobre la licencia. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Señaló que la guía de configuración nunca mencionaba las sobrescrituras de binarios de motores ni `SNAPOTTER_HW_ACCEL`, que ahora están documentados. (#1312, #1696)
- **@aron-intframe** ❤️: Reprodujo una laguna en el manejo de errores de exiftool en un clon nuevo y descubrió que la condición de carrera de la ruta temporal era peor de lo que describía la incidencia. (#3458)

Gracias también a los miembros de la comunidad que reportaron estos casos por Discord y por correo electrónico, y cuyos nombres no registramos.

[Diferencias completas en GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

La mayor parte de 2.2 es endurecimiento. Un usuario no administrador con un rol `users:manage` delegado podía tomar el control de una instancia, y resultó que a todos los endpoints de herramientas les faltaba su comprobación de permisos. Actualice si tiene más de un usuario.

El resto es la larga cola del autoalojamiento: descargas que empezaban y nunca terminaban, ajustes preestablecidos que se rompían en cuanto añadía un segundo archivo, contenedores que se reiniciaban en bucle mientras Postgres aún arrancaba. También llegaron dos herramientas nuevas. La documentación y el sitio web ahora están traducidos a 21 idiomas, y la interfaz por fin cumple el contraste WCAG AA.

> [!IMPORTANT]
> Si concedió `users:manage` a un usuario no administrador mediante un rol personalizado, ese rol podía tomar el control de cuentas de administrador en 2.0.0 hasta 2.1.0. Los detalles están en Seguridad.

### Seguridad {#v2-2-0-security}

- **Escalada de privilegios mediante un rol `users:manage` delegado (GHSA-9xgh-95qh-2x7h).** Un usuario no administrador con `users:manage` a través de un rol personalizado podía restablecer la contraseña de una cuenta de mayor privilegio, o eliminarla, incluido un administrador integrado, y tomar el control de la instancia. El restablecimiento de contraseña y la eliminación de cuentas ahora verifican la autoridad de quien llama sobre el objetivo, de modo que un rol delegado no puede alcanzar niveles por encima del suyo. Afectadas: de 2.0.0 a 2.1.0. Reportado por 李春来 (Chunlai Li). (#616)
- **Todos los endpoints de herramientas ahora están protegidos.** El acceso a las herramientas se aplicaba ruta por ruta, así que las 45 rutas escritas a mano debían recordar la misma llamada y ninguna lo hacía. Un rol sin `tools:use` aún podía ejecutar image-to-pdf, erase-object, upscale, sign-pdf y el resto. La comprobación ahora reside en un único preHandler basado en la ruta coincidente, por lo que cubre las subrutas y cualquier ruta que se añada en el futuro. (#646)
- **La limitación de tasa se podía eludir en las instalaciones con Docker.** La imagen se distribuía con `TRUST_PROXY=true`, así que la IP del cliente provenía de una cabecera de la solicitud y un `X-Forwarded-For` falsificado superaba el limitador de inicio de sesión. El valor predeterminado ahora es una lista de confianza de redes privadas. (#649)
- **Las escrituras de ajustes se comprueban por ajuste**, no una sola vez en la entrada, y la importación de configuración ahora es transaccional, de modo que una clave rechazada no pueda dejar una configuración aplicada a medias. (#618)
- **Los nombres de archivo de la biblioteca no pueden escapar de su raíz de almacenamiento.** Un nombre almacenado manipulado, que una importación SQLite 1.x maliciosa copia tal cual, podía leer o eliminar archivos fuera del directorio de archivos. Solo es alcanzable después de que un operador importe una base de datos SQLite 1.x proporcionada por un atacante, que es la única vía que permite elegir un nombre almacenado. Reportado por @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **La cancelación de trabajos exige la propiedad**, de modo que un usuario autenticado ya no puede cancelar el trabajo de otro usuario mediante su ID. Reportado por @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Una nueva auditoría de todo el árbol 2.0 detectó lo que seguía abierto**: se podía reproducir una aserción SAML capturada, un desafío de MFA sobrevivía a cualquier número de códigos erróneos, la búsqueda de clave de API por solicitud era un escaneo completo de la tabla, `MAX_WORKSPACE_SIZE_GB` era configuración muerta, y el sanitizador de SVG dejaba pasar href sin comillas de `javascript:`. (#620)
- **Nueve CVE divulgados parcheados**: fast-uri, svgo, sharp y tar de forma transitiva (#619), además de Pillow 12.3.0 (#517). La decodificación RAW en arm64 ahora compila LibRaw 0.22.2 desde el código fuente en lugar de enlazar una copia del sistema sin parchear. (#649)

### Funciones nuevas {#v2-2-0-new-features}

- **Rounded Crop**: máscaras de cuadrado redondeado y de squircle al estilo iOS, con un control del radio de las esquinas. Pensado para favicons e iconos de aplicaciones. (#602)
- **Remove GIF Background**: elimine el fondo de un GIF animado, WebP o APNG fotograma a fotograma y obtenga una animación transparente. (#502)
- **Lazo y modo de Alta Calidad en Object Eraser**: arrastre un lazo libre en lugar de pintar cada píxel y, opcionalmente, instale un paquete de relleno por difusión para rellenos más limpios de áreas grandes. (#503, #566)
- **Guardar como nuevo, o sobrescribir.** Editar un archivo de la biblioteca solía reemplazar silenciosamente el original. Ahora usted elige en cada edición, y el valor predeterminado lo conserva. (#564, #577)
- **Ajustes preestablecidos de relación de aspecto en Resize.** Elija 1:1, 4:3 o 16:9 y las dos dimensiones permanecen bloqueadas, sin ampliar. (#530)
- **OCR de dos niveles**: un nivel rápido incluido en la imagen que se ejecuta sin conexión y sin descargas, y un entorno de ejecución más preciso que se instala bajo demanda. (#519)
- **Escriba en cualquier lugar para buscar.** Empiece a escribir en el panel o en la página de inicio y el texto llega al cuadro de búsqueda. (#644)
- **Documentación y sitio web en 21 idiomas**: el sitio de documentación, las páginas de inicio y la referencia de la API ahora están traducidos, sumándose a la interfaz de la aplicación. Una nueva guía de despliegue con pocos recursos cubre Raspberry Pi y equipos de 2 GB. (#548)
- **Nombres de herramientas más claros**: 18 nombres ambiguos ahora se autocualifican, así que "Compress" pasó a ser "Compress Image". Los ID y las rutas de las herramientas no cambian, así que nada de lo que tenga guardado en marcadores se rompe. (#520)

### Mejoras {#v2-2-0-improvements}

- **Contraste WCAG AA en toda la interfaz**: la paleta se reajustó para que el naranja vivo quede en los rellenos mientras el texto y las etiquetas usan tokens de tinta accesibles, y los 57 indicadores de foco superan ahora el umbral de 3:1 para elementos no textuales. (#567, #574)
- **Upscale y la eliminación de fondo dejan de parecer congelados**: la barra de progreso avanza durante la inferencia en lugar de quedarse en 30%, y ambas herramientas ahora advierten de que un host solo con CPU es mucho más lento. (#605, #608)
- **Los mensajes de tiempo de espera nombran la causa real** y tienen en cuenta los hosts solo con CPU en lugar de culpar a la carga. (#596)
- **SnapOtter espera a Postgres y a Redis al iniciar** en lugar de reiniciarse en bucle, tanto en Compose como en la imagen todo en uno. Una instalación en Proxmox LXC se reiniciaba 76 veces antes de esto. (#537, #595)
- **Las descargas sobreviven a un proxy inverso**: SnapOtter pide a nginx y a los proxies compatibles que no almacenen en búfer las respuestas de archivos, que es el motivo habitual de que una descarga autoalojada empiece y nunca termine. (#604, #607)
- **Compress PDF se acerca al tamaño objetivo**, e indica con honestidad cuando un objetivo está fuera de alcance. (#522)
- **Los controles de las herramientas en móvil siguen siendo accesibles** ahora que las estructuras de la aplicación se ajustan a la ventana gráfica dinámica. (#559)
- **Convert Audio expone un ajuste de frecuencia de muestreo.** (#561)
- **Los administradores pueden relajar la longitud mínima de la contraseña**, hasta 1 en una instancia de LAN de confianza. (#543)
- **MFA es de autoservicio**, se cerró el bloqueo por política, y los inicios de sesión con OIDC o SAML reciben un desafío de MFA real en lugar de un bloqueo total. (#531, #536)
- **Un `Error: Error` a secas ahora nombra su causa.** Los fallos de codificación de Sharp, las salidas del sidecar de IA, la salida del sidecar de documentos que no era JSON y los fallos de eliminación de fondo solían llegar con el motivo borrado. (#532, #534, #535, #538, #612)
- **El cuadro de diálogo de ayuda está traducido.** Las etiquetas de sus atajos y el texto de primeros pasos estaban fijados en inglés mientras había traducciones terminadas sin usar en los 21 archivos de idioma. (#647)

### Correcciones de errores {#v2-2-0-bug-fixes}

- **Los archivos HEIC del iPhone se rechazaban** como ilegibles antes de llegar al decodificador que los maneja. (#631)
- **Los ajustes preestablecidos de conversión fallaban con un segundo archivo**: jpg-to-pdf y sus equivalentes de image-to-pdf, además de pdf-to-png, pdf-to-jpg y pdf-to-tiff, devolvían todos `Tool not found` cuando cargaba dos archivos. (#633, #643)
- **Los ajustes preestablecidos de conversión de PDF perdieron su botón de descarga.** (#629)
- **No se respetaba un tiempo de espera de procesamiento ilimitado**, y los flujos de progreso detenidos ahora se recuperan en lugar de dejar a la interfaz esperando. (#638)
- **Las descargas se colgaban en lugar de fallar** cuando un archivo almacenado resultaba ser más corto que su longitud registrada. (#617)
- **Las herramientas de páginas PDF fallaban con archivos cortos y cifrados**: Remove Pages usaba por defecto un intervalo de páginas que ningún documento de menos de seis páginas tiene, y los PDF protegidos con contraseña fallaban de forma críptica dentro del worker. (#594)
- **PDF to Text devolvía en silencio un archivo vacío** con los PDF escaneados. Ahora le indica OCR y sirve el texto en UTF-8. (#603)
- **PDF to Word descartaba los bloques de texto de color** y los dividía a lo largo de la página. (#500)
- **Object Eraser dejaba restos fantasma** y difuminaba los objetos pequeños en imágenes de alta resolución. (#501)
- **Stabilize Video escribía una salida no reproducible** sin faststart. (#593)
- **Reparaciones del editor de imágenes**: girar, voltear, cambiar tamaño, niveles, curvas, filtros y bloqueo de capas. (#597)
- **Sign PDF mostraba un lienzo en blanco** en lugar de informar de por qué un PDF no se cargaba. (#545)
- **La biblioteca de archivos registraba dimensiones 0x0** y omitía las vistas previas de las cargas HEIC, RAW y PSD. (#636, #637)
- **Instalar más de un paquete de IA** dejaba el entorno virtual compartido con varias versiones y rompía en silencio tres herramientas. (#649)
- **Convertir a JXL con calidad de 1 a 4 devolvía un 500**, y un ffmpeg ausente se le informaba como una carga corrupta. (#649)
- **Una interrupción transitoria de Postgres dejaba varados los trabajos terminados**, con la salida en disco y ninguna fila que apuntara a ella. Ahora un reconciliador adopta ese trabajo en lugar de descartarlo. (#649)
- **Un endpoint de Redis que cambiaba de dirección bloqueaba a todos los consumidores** mientras las comprobaciones de estado seguían respondiendo 200. (#649)
- **Correcciones del sitio web y de la documentación**: los enlaces localizados ya no pierden los fragmentos `#` ni ponen en minúsculas `zh-CN`, la navegación de la documentación permanece dentro de la ventana gráfica en tabletas, y ninguno de los dos sitios llama ya a la API de GitHub desde su navegador. (#516, #562, #570, #560)

### Notas de actualización {#v2-2-0-upgrade-notes}

No hay nada que migrar, pero cambiaron dos valores predeterminados incluidos:

- **`TRUST_PROXY` ahora tiene por defecto `loopback,linklocal,uniquelocal`** en lugar de confiar en todos los pares. Las redes puente de Docker y de Compose están dentro de ese rango, así que la mayoría de las configuraciones no necesitan cambios. Si su proxy inverso llega a SnapOtter desde una dirección pública, defina `TRUST_PROXY` explícitamente, o la limitación de tasa y los registros de auditoría atribuirán cada solicitud al proxy.
- **`MAX_AI_JOBS_PER_USER` tiene por defecto 5** trabajos de IA de un solo archivo en curso por usuario. Las ejecuciones de IA por lotes y de pipelines siguen sin límite.

Nuevos parámetros opcionales: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (desactivado por defecto) y `GIF_BG_MAX_FRAMES`.

### Agradecimientos {#v2-2-0-acknowledgements}

Buena parte de esta versión empezó como el reporte de errores de otra persona.

Código y contribuciones:

- **@mvanhorn** ❤️: Reescribió el fallo por tiempo de espera de remove-background como un mensaje que indica qué hacer al respecto, en lugar de un simple tiempo de espera agotado. (#518, #494)
- **@EuanTop** ❤️: Restauró la acción de descarga en las páginas de ajustes preestablecidos de conversión de PDF haciendo que la ruta síncrona devolviera el contrato estándar de resultado de herramienta. (#629, #623)
- **@harshjainnn** ❤️: Diagnosticó la descarga que empieza y nunca termina, y propuso la dirección de reinicio del socket sobre la que se construyó la corrección. (#617, #590)

Divulgaciones de seguridad:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Divulgó de forma privada la escalada de privilegios mediante un rol `users:manage` delegado, con un análisis completo desde el origen hasta el destino y una cadena de explotación funcional. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Divulgó un IDOR autenticado en la cancelación de trabajos, y un path traversal en los nombres de archivo almacenados de la biblioteca, alcanzable tras una importación SQLite 1.x maliciosa, con una prueba de concepto funcional para cada uno. (#599, #600)

Reportes de errores:

- **@riz467** ❤️: Archivos HEIC reales de iPhone rechazados en la validación, con la causa raíz determinada en el reporte. (#622)
- **@coupej** ❤️: Las páginas de ajustes preestablecidos de PDF que se colgaban para siempre, y jpg-to-pdf que fallaba en cuanto se añadía un segundo archivo. Dos errores distintos, correctamente separados. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documentado como ilimitado pero limitado a cinco minutos. (#630)
- **@bezibaerchen** ❤️: Convert Audio ocultaba el ajuste de frecuencia de muestreo que su propia descripción prometía. (#558)
- **@hell-toupee** ❤️: El paquete de OCR preciso que no se instalaba, con un error `libpaddle`. (#505)
- **@Michael1260** ❤️ y **@And-CSH** ❤️: Confirmaron de forma independiente ese fallo de instalación de OCR y establecieron que la extracción manual funciona mientras que el instalador de la aplicación no, lo que acotó el error al instalador. (#505)
- **@TomErnst1972** ❤️: Activar la política de MFA obligatoria bloqueaba a un administrador fuera de su propia instancia. (#515)
- **@thokich** ❤️: El borrado de objetos producía rellenos borrosos e inservibles, lo que impulsó tanto la reescritura de inpainting en HD como el paquete opcional de alta calidad. (#141)
- **@Hennie-git** ❤️: Una instalación en Proxmox LXC que se reiniciaba 76 veces contra un Postgres que aún no aceptaba conexiones. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Clasificó ese reporte en tiempo real y produjo el diagnóstico sobre el que se construyó la corrección del arranque. (#537)

Solicitudes de funciones y comentarios:

- **@LECOQQ** ❤️: Pidió relajar la complejidad de las contraseñas en una instalación de servidor doméstico. (#136)
- **@killervette42** ❤️: Pidió una aplicación de comunidad de Unraid, ahora publicada en la tienda Unraid CA. (#96)
- **@alienatedsec** ❤️: Señaló que la corrección de que la GPU recurre a la CPU estaba enterrada en una incidencia cerrada y no se podía encontrar, que es por lo que ahora está en la documentación de despliegue. (#490, #587)
- **@neilp316** ❤️: Confirmó el fallo de la GPU Blackwell en una RTX 5060 y trazó una ruta de actualización funcional a CUDA 12.8. (#120)
- **@Roiki11** ❤️: Defendió el almacenamiento compartido con referencias de ruta en lugar de la transferencia de archivos por HTTP para el cómputo de IA fuera del equipo. (#189)

Gracias también a los miembros de la comunidad que reportaron estos casos por Discord y por correo electrónico, y cuyos nombres no registramos: la solicitud del recorte squircle (#602), la descarga de image-to-PDF que empezaba y nunca terminaba (#604, #607), la herramienta Delete Pages que se atascaba (#594), el texto en árabe que faltaba en pdf-to-text (#603) y el diagnóstico detrás de la alternativa de GPU a CPU de ONNX (#490).

[Diferencias completas en GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 convierte el conjunto de herramientas de imagen en una suite completa de manipulación de archivos: más de 200 herramientas en cinco modalidades (Imagen, Vídeo, Audio, PDF y Archivos), reconstruida sobre Postgres 17 y una cola de trabajos respaldada por Redis, con un `docker run` de un solo comando. Es una versión mayor; lea los Cambios incompatibles antes de actualizar desde 1.x.

### Funciones nuevas {#new-features}

- **Cuatro nuevas modalidades de herramientas**: Vídeo, Audio, PDF y Archivos se suman a Imagen, llevando el catálogo a más de 200 herramientas.
- **Trabajos en segundo plano duraderos**: Una cola respaldada por Redis (BullMQ) ejecuta cada herramienta como un trabajo con seguimiento y progreso en vivo por SSE.
- **Modo todo en uno de un solo contenedor**: Un único `docker run` arranca una instancia completa con Postgres y Redis integrados.
- **Paquetes de IA bajo demanda**: La eliminación de fondo, el OCR, la transcripción, el aumento de escala, la detección y mejora de rostros, el borrado de objetos, la colorización y la restauración de fotos se instalan desde la interfaz. La aceleración por GPU se detecta por framework.
- **Sign PDF**: Dibuje, escriba o cargue una firma y colóquela en un PDF en el navegador.
- **Automate**: Un constructor visual de pipelines que encadena herramientas, con nueve plantillas predefinidas.
- **83 ajustes preestablecidos de conversión con un clic**: Conversores dedicados como JPG a PNG, MP4 a GIF y similares, con búsqueda aproximada.
- **Editor de imágenes por capas**: Un editor basado en Konva en `/editor` con pinceles, formas, ajustes, filtros y curvas.
- **Biblioteca de Archivos**: Guarde cualquier resultado y reutilícelo como entrada de otra herramienta.
- Herramientas fijadas, zoom y desplazamiento en el lienzo, 21 idiomas y capacidades enterprise (OIDC/SSO, SAML, SCIM, almacenamiento S3, permisos por herramienta, exportación de auditoría, trazado distribuido).

### Mejoras {#improvements}

- Cancele un proceso en ejecución. (#137)
- Decodificación RAW a resolución completa mediante LibRaw, incluido DNG. (#289)
- Despliegues sin root y con UID ajenos (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Detección precisa de la instalación de IA y un flujo de instalación reforzado. (#214, #352)
- Endurecimiento de la privacidad: sin salida automática hacia terceros, además de un modo estricto sin conexión opcional.
- Botón de comentarios siempre activo, incluso con la analítica desactivada.

### Correcciones de errores {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` vuelve a desactivar la limitación de tasa para las rutas de herramientas. (#271)
- Se repararon las rutas del entorno virtual de IA dentro de la imagen de Docker. (#390)
- Compatibilidad con sharp 0.35.2+. (#362)
- Correcciones del diseño del editor de imágenes: reglas, comportamiento de relleno, barra lateral y tamaño del lienzo. (#258, #259)
- Se completó la traducción al italiano. (#231, #206, #425)
- Audio normalize y loudnorm conservan la frecuencia de muestreo de origen.
- Endurecimiento contra SSRF: coincidencia numérica de CIDR de IPv6 y un análisis previo de URL ampliado. (#287)
- Los PDF generados se sellan con SnapOtter como Producer.
- mediapipe se instala en Python 3.13 y Debian 13.

### Cambios incompatibles {#breaking-changes}

2.0 reemplaza la base de datos SQLite integrada por Postgres 17 y añade Redis 8 para la cola de trabajos. Sus datos de 1.x se migran automáticamente en el primer arranque, pero la pila de contenedores cambió, así que respalde primero todo su volumen `/data` (1.x ejecuta SQLite en modo WAL, por lo que los datos confirmados suelen residir en `snapotter.db-wal`). Luego elija la imagen de un solo contenedor (Postgres y Redis integrados, solo root) o la pila Compose (aplicación más Postgres 17 y Redis 8). Consulte la [guía de migración](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) y la [guía de actualización](/fr/guide/upgrading).

### Actualización {#upgrade}

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

Nueva herramienta HTML to Image, accesibilidad WCAG 2.2 AA, endurecimiento de seguridad a partir de pruebas de penetración y 5 correcciones críticas de Docker.

### Funciones nuevas {#new-features-1}

- **HTML to Image**: Capture capturas de pantalla de URL o de HTML en bruto como PNG/JPEG/WebP. Capturas de página completa, ventanas gráficas personalizadas, modo oscuro.
- **Convención _FILE de secretos en Docker**: Monte las variables de entorno sensibles como archivos en lugar de texto sin cifrar. (#205)
- **Licencias enterprise y almacenamiento S3**: Clave de licencia comercial opcional y almacenamiento de objetos compatible con S3.
- **Mejoras del editor de formas**: Transparencia de relleno/trazo, selector de color RGBA, estilos de línea discontinua.
- **Archivos de versión precompilados**: Descargue tarballs desde GitHub Releases para instalaciones sin Docker (Proxmox, bare metal, LXC). (#202)

### Mejoras {#improvements-1}

- **Accesibilidad WCAG 2.2 AA**: Salto de navegación, atrapado del foco, regiones aria-live, compatibilidad con movimiento reducido, relaciones de contraste correctas. (#209)
- **Adaptación a móviles**: Ajustes adaptables, reconexión automática de SSE al cambiar de pestaña en el móvil. (#203, #204)
- **Calidad de la eliminación de fondo**: Suavizado de bordes, descontaminación de color, selección del formato de salida.
- **Traducción al italiano**: ~145 cadenas nuevas por @albanobattistella. (#206)
- **Documentación de la API por herramienta**: 53 páginas de documentación con parámetros, ejemplos y formatos de respuesta.
- **Descargas de modelos de IA**: Lógica de reintentos con retroceso exponencial para HuggingFace. (#201)

### Correcciones de errores {#bug-fixes-1}

- Los contenedores de Docker nuevos eran completamente inutilizables (la limitación de tasa bloqueaba todas las solicitudes).
- Las herramientas de IA de detección de rostros (blur-faces, red-eye-removal, enhance-faces, passport-photo) fallaban en todas las plataformas.
- Los archivos HEIC fallaban en ARM (discrepancia de símbolos de libheif).
- Los paquetes de IA de upscale y restore-photo no se instalaban en ARM.
- OCR usaba la versión de CUDA equivocada en contenedores con GPU.
- Elusión de la protección SSRF mediante direcciones IPv6 mapeadas desde IPv4 en hexadecimal. (Crédito: @tonghuaroot)
- Decodificación de HEIC de iPhone con imágenes auxiliares. (#183, #199)
- CUDA OOM de Real-ESRGAN en GPU de 8 GB. (#200)
- 6 errores de Sentry en producción y 7 errores de QA. (#208)

### Seguridad {#security}

- Se abordaron 10 hallazgos de pruebas de penetración (elusión de XFF, fallos por JSON mal formado, pipelines sin límite, XSS en el registro de auditoría, método TRACE y más). (#207)
- Se bloqueó la elusión SSRF mediante IPv6 en hexadecimal. (Crédito: @tonghuaroot)
- Las imágenes base del Dockerfile se fijaron por digest.

### Actualización {#upgrade-1}

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

Demo en vivo, páginas de destino por herramienta y un lote de correcciones de pulido.

### Funciones nuevas {#new-features-2}

- **Demo en vivo** - [demo.snapotter.com](https://demo.snapotter.com) permite a las personas probar SnapOtter sin instalar nada.
- **Página de índice de herramientas** - Explore las más de 50 herramientas en `/tools` con búsqueda y filtros por categoría.
- **Más de 50 páginas de destino para SEO** - Cada herramienta ahora tiene una página de destino propia con preguntas frecuentes, casos de uso y tablas comparativas.
- **Vista previa del fondo** - El control deslizante de antes y después muestra un fondo de cuadros detrás de las imágenes transparentes.
- **Generador de contraseñas seguras** - Botón de un clic en el formulario Agregar miembros.

### Correcciones de errores {#bug-fixes-2}

- La herramienta de información de HEIC/HEIF ya no falla (se añadió una predecodificación).
- La instalación de paquetes de modelos de IA muestra mejores mensajes de error y respeta los límites de recursos.
- Las miniaturas de la biblioteca se cargan correctamente (faltaban las cabeceras de autenticación).
- Los menús desplegables ya no se recortan en las tablas de ajustes de Personas y Equipos.
- El porcentaje de comparación de tamaño se oculta en las herramientas que no comprimen.
- Se eliminó el enlace duplicado a la política de privacidad.
- Se añadió la traducción al italiano de los ajustes de funciones de IA.
- Se actualizaron los iconos de Lucide renombrados (Wand2, Columns).

### Infraestructura {#infrastructure}

- OpenSSF Scorecard reforzado de 4.3 a ~7.0.
- Las pruebas de CI se paralelizaron en 4 fragmentos con datos de prueba reducidos.
- 41 actualizaciones de dependencias.

### Actualización {#upgrade-2}

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

Cinco herramientas nuevas, un editor de imágenes completo, inicio de sesión con SSO, 20 idiomas. Probablemente debieron ser tres versiones distintas, pero aquí estamos.

### Funciones nuevas {#new-features-3}

- **Editor de imágenes** - Capas, pinceles, formas, ajustes, filtros, curvas, atajos de teclado. Se ejecuta en su navegador, procesa en su hardware.
- **Autenticación OIDC / SSO** - Inicie sesión con Google, GitHub, Okta o cualquier proveedor de OpenID Connect. Defina unas pocas variables de entorno y su equipo usa sus cuentas existentes.
- **Generador de memes** - 100 plantillas integradas con renderizado de texto mediante opentype.js. O cargue su propia imagen.
- **Beautify** - Suelte una captura de pantalla y obtenga una imagen pulida. Marcos de dispositivo (macOS, Windows, navegador), sombras, degradados, ajustes preestablecidos para redes sociales.
- **Simulación de daltonismo** - Previsualice cómo se ven las imágenes con protanopía, deuteranopía, tritanopía y otras deficiencias de la visión del color.
- **Corrector de transparencia de PNG** - Detecta los PNG con falsa transparencia y los corrige con BiRefNet HR-matting. Eliminación opcional de marcas de agua mediante inpainting con LaMa.
- **Expansión de lienzo con IA** - Extienda los límites de la imagen con relleno de IA. Tres niveles de calidad (rápido, equilibrado, calidad) según cuánto tiempo de GPU quiera intercambiar.
- **20 idiomas** - Árabe, chino (simplificado/tradicional), checo, neerlandés, francés, alemán, hindi, indonesio, italiano, japonés, coreano, polaco, portugués, ruso, español, tailandés, turco, ucraniano, vietnamita. RTL funciona para el árabe.
- **Importación por URL** - Pegue URL en la zona de carga o impórtelas en bloque desde una lista. Obtención desde el servidor con protección contra SSRF.
- **Borrador de varios archivos** - Dibuje máscaras de borrado en varias imágenes y procéselas todas con un clic. Los trazos persisten por imagen.
- **Importación/exportación de pipelines** - Guarde cadenas de herramientas como JSON y compártalas con otros.
- **17 nuevos formatos RAW de cámara** mediante exiftool, además de entrada QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ y APNG. Nuevos códecs de salida para BMP, ICO, JP2, QOI. La exportación a AVIF, TIFF, GIF, JXL y PSD se recuperó de una rama perdida anteriormente.

### Mejoras {#improvements-2}

- **Mejora de imagen** - Se reemplazó el pipeline anterior por CLAHE + normalización + gamma. Un nuevo interruptor Deep Enhance usa el modelo de IA para obtener resultados más agresivos.
- **Restore photo** - Detección de arañazos reescrita con filtrado Otsu de 8 ángulos. El inpainting con LaMa ahora se ejecuta a resolución nativa.
- **Formatos exóticos en todas partes** - OCR, image-to-PDF, el generador de favicons, composition, stitch y vectorize ahora decodifican HEIC, RAW y PSD.
- **Compress** - La tolerancia del tamaño objetivo se redujo del 5% al 1%. El tamaño objetivo es el modo predeterminado. Se añadieron botones de incremento y un selector de unidades KB/MB.
- **Limpieza de Sentry** - Se filtraron 644 eventos sin acción posible. Los errores reales ahora se gestionan correctamente.
- **Detección de GPU** - Mejor diagnóstico para contenedores donde CUDA está presente pero nvidia-smi no.
- **Modo con autenticación desactivada** - El usuario anónimo se siembra en la base de datos con el rol de administrador. Las claves de API, los pipelines y los archivos de usuario ya no fallan por restricciones de clave externa.
- **Más de 2,705 pruebas nuevas** entre unitarias, de integración y E2E.

### Correcciones de errores {#bug-fixes-3}

- Upscale en CPU ya no agota el tiempo en equipos NAS y hardware de bajo consumo.
- El logotipo del código QR ya no hace desaparecer la vista previa de forma permanente.
- Se corrigió el desbordamiento del recorte en imágenes verticales altas.
- Los archivos TIFF con alfa ahora fuerzan correctamente la salida PNG en lugar de producir corrupción.
- La decodificación de HDR/EXR convierte a 8 bits antes de CLAHE, lo que corrige los fallos de decodificación.
- Los búferes de entrada de puntos de referencia faciales se convierten a PNG antes del sidecar de Python, lo que corrige los fallos.
- Find duplicates gestiona lotes de formatos mixtos y errores de red.
- La vista previa de Beautify se actualiza en tiempo real.
- Barras de progreso para stitch y vectorize.
- SVGZ gestionado por SVG-to-raster.
- Se corrigieron los nombres de archivo no ASCII mediante la cabecera X-File-Results codificada en porcentaje.

### Actualización {#upgrade-3}

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

Imagen de Docker unificada con detección automática de GPU. Una sola imagen gestiona tanto cargas de trabajo de CPU como de GPU. Compose simplificado en un solo archivo con rotación de registros. Las descargas previas de modelos ahora incluyen verificación y una prueba de humo.

---

## v1.13.0 {#v1-13-0}

Control de acceso basado en roles (RBAC). 14 permisos granulares, tres roles integrados (admin, editor, user), compatibilidad con roles personalizados. Comprobaciones de permisos en todas las rutas de la API. Las pestañas del frontend se filtran según los permisos del usuario.

---

## v1.12.0 {#v1-12-0}

Herramienta PDF to Image. Convierta páginas de PDF a PNG, JPEG, WebP o TIFF con DPI personalizado. Imagen de Docker unificada con detección automática de GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt generado automáticamente mediante vitepress-plugin-llms para una documentación apta para IA.

---

## v1.10.0 {#v1-10-0}

Cambio de tamaño según el contenido (seam carving) con protección de rostros. Cambie el tamaño de las imágenes conservando el contenido importante.

---

## v1.9.0 {#v1-9-0}

Herramienta Stitch / Combine. Una imágenes lado a lado, apiladas verticalmente o en una cuadrícula personalizada.

---

## v1.8.0 {#v1-8-0}

Herramienta Edit Metadata. Vea y edite metadatos EXIF, IPTC y XMP con una interfaz granular de quitar/conservar.

---

## Versiones anteriores {#older-releases}

Para el registro de cambios completo a nivel de commits, incluidas las versiones de parche, consulte [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
