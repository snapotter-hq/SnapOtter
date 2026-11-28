---
description: "Todas las variables de entorno de SnapOtter con sus valores predeterminados. Configura autenticación, almacenamiento, modelos de IA, analítica y más."
i18n_source_hash: 3523a064e1a6
i18n_provenance: machine
i18n_output_hash: 64547e181139
i18n_hash_version: 2
---

# Configuración {#configuration}

Toda la configuración se realiza mediante variables de entorno. Cada variable tiene un valor predeterminado sensato, por lo que SnapOtter funciona de inmediato sin necesidad de establecer ninguna de ellas.

## Variables de entorno {#environment-variables}

### Servidor {#server}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `PORT` | `1349` | Puerto en el que escucha el servidor. |
| `HOST` | `0.0.0.0` | Dirección IP en la que escucha el servidor. En una red bridge (la predeterminada para `docker run` y Compose), mantén `0.0.0.0` (o `::`), o los puertos publicados dejarán de funcionar. En una instalación nativa o en un contenedor en la red del host, `127.0.0.1` mantiene la API fuera de la red; coloca un proxy inverso delante para el acceso remoto. El [modo embebido](#embedded-mode) solo funciona con `0.0.0.0`, `::` o `127.0.0.1`, porque su comprobación de inicio llama a `127.0.0.1`. Con cualquier otra dirección, incluida `::1`, el contenedor nunca se considera iniciado, y un fallo posterior lo detiene en lugar de reiniciar el servidor. Cualquier valor que no sea una dirección IP, incluido `localhost`, detiene el servidor al iniciarse. |
| `BASE_PATH` | (vacío) | Ruta pública de despliegue, por ejemplo `/snapotter`. Vacío o `/` sirve en la raíz del dominio. Se aplica en tiempo de ejecución; no hace falta reconstruir la imagen. |
| `RATE_LIMIT_PER_MIN` | `1000` | Máximo de solicitudes por minuto por IP. Ponlo a 0 para desactivar la limitación de tasa. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Máximo de solicitudes por minuto por IP a los endpoints de gestión de claves de API (listar, crear, revocar). Las claves en uso para llamadas a herramientas no se ven afectadas. Ponlo a `0` para que no haya límite. |
| `CORS_ORIGIN` | (vacío) | Orígenes permitidos para CORS separados por comas, o vacío para solo el mismo origen. |
| `LOG_LEVEL` | `info` | Verbosidad del registro. Uno de: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Qué pares pueden establecer la IP del cliente mediante `X-Forwarded-For`. El valor predeterminado solo cree a un par de una red privada, así que un proxy inverso en una red de Docker o en una LAN sí es de confianza y la cabecera falsificada de un cliente público no. Pon `true` solo cuando delante haya un proxy bajo tu control en una dirección pública. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | Establécela en `off` para iniciar una instancia nueva con «Analítica de producto anónima» desactivada, de modo que no envíe nada desde su primer arranque. Solo rellena el ajuste mientras nadie haya elegido uno. Una vez guardado el ajuste, por un administrador o por esta variable, cambiar la variable no tiene ningún efecto; un administrador aún puede activar la analítica en Configuración > Sistema > Privacidad. |

### Autenticación {#authentication}

Los dos valores booleanos de abajo solo aceptan `true` y `false`. Cualquier otra cosa, ya sea `1`, `yes` u `on`, no supera la validación y el servidor termina antes de ponerse a escuchar.

| Variable | Predeterminado | Descripción |
|---|---|---|
| `AUTH_ENABLED` | `true` | Exige un inicio de sesión. Ponlo a `false` para funcionar sin ninguna cuenta, lo que concede permisos de administrador a todas las solicitudes, así que resérvalo para una red de confianza. |
| `DEFAULT_USERNAME` | `admin` | Nombre de usuario de la cuenta de administrador inicial. Solo se usa en la primera ejecución. |
| `DEFAULT_PASSWORD` | `admin` | Contraseña de la cuenta de administrador inicial. Cámbiala tras el primer inicio de sesión. |
| `MAX_USERS` | `0` (ilimitado) | Número máximo de cuentas de usuario registradas. Ponlo a 0 para ilimitado. |
| `SESSION_DURATION_HOURS` | `168` | Duración de la sesión de inicio de sesión en horas (el valor predeterminado es 7 días). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Ponlo a `true` para omitir el aviso obligatorio de cambio de contraseña en el primer inicio de sesión. |
| `LOGIN_ATTEMPT_LIMIT` | `30` | Máximo de solicitudes de inicio de sesión por minuto por IP. Los intentos adicionales reciben un `429` hasta que termina el minuto. Los fallos repetidos de un mismo usuario suelen alcanzar antes `LOGIN_THROTTLE_MAX_FAILURES`. Un administrador puede anularlo en Ajustes > Sistema. Ponlo a `0` para que no haya límite. Una compilación desde el código fuente empieza en 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Inicios de sesión con contraseña fallidos que puede tener un usuario dentro de `LOGIN_THROTTLE_WINDOW_S` antes de que los intentos posteriores reciban un `429`, sea cual sea la IP de origen. Vuelven a permitirse a medida que los fallos más antiguos salen de la ventana. Ponlo a 0 para desactivar la limitación. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Duración de esa ventana, en segundos. Debe ser al menos 1; el servidor se niega a arrancar con 0. |

### Almacenamiento {#storage}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` o `s3`. S3 y MinIO necesitan una licencia con la función s3_storage, además de las variables `S3_*` de abajo. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Cadena de conexión de PostgreSQL. Es también la conexión con la que se atiende cada solicitud; a partir de la 2.3.0, si estableces también `DATABASE_MIGRATION_URL`, esta pasa a ser el rol de ejecución con privilegios mínimos, con DML sobre las tablas de la app y nada más. La pila de Compose la apunta a su servicio `postgres`; déjala sin establecer (junto con `REDIS_URL`) para obtener el modo embebido. Para conectar por un socket unix, indica el directorio del socket en `host`, como en `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`, y monta ese directorio en el contenedor. |
| `DATABASE_MIGRATION_URL` | (vacío) | Conexión privilegiada, usada solo durante el arranque para ejecutar las migraciones y conceder los permisos al rol de ejecución, y luego se cierra antes de la primera solicitud. Déjala vacía y SnapOtter funciona con un solo rol, con `DATABASE_URL` haciendo ambas tareas. Consulta [Roles de privilegio mínimo](/es/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Cadena de conexión de Redis (usada para las colas de tareas de BullMQ). Compose la apunta a su servicio `redis`. Para un socket unix, usa `unix:///run/redis/redis.sock?db=5` (añade `&password=...` si Redis lo necesita) y monta el socket en el contenedor. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directorio para archivos temporales durante el procesamiento. Se limpia automáticamente. La imagen establece `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Directorio para archivos de usuario persistentes (imágenes subidas, resultados guardados). La imagen establece `/data/files`. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Límite en megabytes de lo que cada usuario conserva en la biblioteca de Archivos. Un guardado que lo superaría se rechaza indicando la cantidad usada y el límite. Una cuota definida en el usuario lo anula. Ponlo a 0 para ilimitado. |

### Almacenamiento de objetos S3 {#s3-object-storage}

Solo se leen cuando `STORAGE_MODE=s3`. Si falta alguna de las tres obligatorias, el arranque falla indicando el nombre de la variable que omitiste.

| Variable | Predeterminado | Descripción |
|---|---|---|
| `S3_BUCKET` | (vacío) | Bucket que contiene las subidas y las salidas. Obligatorio. |
| `S3_ACCESS_KEY_ID` | (vacío) | Clave de acceso. Obligatoria. En el contenedor puedes montarla en su lugar, mediante `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (vacío) | Clave secreta. Obligatoria. Misma convención de archivo: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Región del bucket. |
| `S3_ENDPOINT` | (vacío) | Endpoint personalizado para MinIO, R2, Backblaze y otros almacenes compatibles con S3. Vacío significa AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Ponlo a `true` para MinIO y para cualquier otro que espere `endpoint/bucket/key` en lugar del direccionamiento por host virtual. |
| `S3_PREFIX` | (vacío) | Prefijo de clave, para que un mismo bucket pueda alojar varias instancias. |

### Cifrado en reposo {#encryption-at-rest}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (vacío) | 64 caracteres hexadecimales (32 bytes). Cifra los ajustes sensibles almacenados en la base de datos. Cualquier cosa que no sean 64 caracteres hexadecimales se rechaza al arrancar. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (vacío) | La clave que estás dejando atrás en una rotación, con el mismo formato. Establece ambas durante la rotación para que las filas existentes se sigan descifrando, y luego elimina esta. |

### Modo embebido {#embedded-mode}

Ejecuta la imagen sin `DATABASE_URL` ni `REDIS_URL` y arrancará sus propios PostgreSQL 17 y Redis dentro del contenedor, enlazados a loopback, con todos los datos en el volumen `/data`. Esto restaura la experiencia de un solo comando `docker run` para el inicio rápido, el homelab y las actualizaciones desde la 1.x. Es una vía de conveniencia, no un despliegue de producción: para producción, ejecuta la pila de Compose de 3 contenedores con PostgreSQL y Redis separados. El modo embebido requiere ejecutar el contenedor como root y es incompatible con los tiempos de ejecución de UID arbitrario (OpenShift, Kubernetes `runAsNonRoot`); usa Compose en esos casos.

| Variable | Predeterminado | Descripción |
|---|---|---|
| `EMBEDDED` | `auto` | Se activa automáticamente cuando tanto `DATABASE_URL` como `REDIS_URL` están sin establecer. Ponlo a `0` para desactivarlo (la app entonces falla rápido si no hay `DATABASE_URL`/`REDIS_URL` externo establecido, en lugar de arrancar silenciosamente una base de datos dentro del contenedor). |
| `REDIS_MAXMEMORY` | `512mb` | Límite de memoria para el Redis embebido (solo en modo embebido). Redúcelo en hosts con memoria limitada, como una Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Puerto de loopback para el PostgreSQL embebido (solo en modo embebido). Cámbialo solo cuando el contenedor comparta una red en la que el 5432 esté ocupado, como con `--network host`. Debe ser distinto de `EMBEDDED_REDIS_PORT` y mayor que 1023, porque PostgreSQL se ejecuta como un usuario sin privilegios que no puede enlazar un puerto privilegiado en la red del host. |
| `EMBEDDED_REDIS_PORT` | `6379` | Lo mismo, para el Redis embebido, que también se ejecuta como un usuario sin privilegios. |
| `EMBEDDED_DB_PASSWORDS` | (vacío) | Ponlo a `1` para generar en el siguiente arranque contraseñas aleatorias para los roles del PostgreSQL embebido y para Redis, guardadas en `/data/.embedded-db-secrets`. A partir de entonces, los inicios de sesión por TCP las necesitan. En un volumen creado por primera vez con 2.3.0 o posterior, el superusuario de PostgreSQL no puede iniciar sesión por TCP en absoluto; en un volumen más antiguo, el propietario de la base de datos es el superusuario, y su contraseña es lo que lo protege. Úsalo siempre que otros programas compartan la red del contenedor, como con `--network host`. Permanece activado para ese volumen: las contraseñas se usan en cada arranque aunque elimines esta variable, y borrar `/data/.embedded-db-secrets` solo te da contraseñas nuevas, o un arranque que falla si la variable no está definida. Si el contenedor no se inicia porque uno de esos archivos está dañado, elimina ese archivo con `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` e inicia el contenedor de nuevo; el siguiente arranque crea uno nuevo. La variable admite `1`, `0` o vacío, y cualquier otro valor detiene el arranque. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Segundos que el arranque espera a que el Redis embebido responda a `PING` antes de rendirse. Al agotarse el tiempo, el contenedor se detiene y registra el motivo, en lugar de quedarse colgado. Segundos enteros de 1 a 999999; no hay valor ilimitado, porque esperar para siempre es justo el fallo que este límite existe para evitar. Súbelo solo si un host lento lo agota. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Lo mismo, para el PostgreSQL embebido. El reloj empieza cuando termina el `initdb` del primer arranque, así que cubre el inicio del servidor y la recuperación tras un fallo, no la creación inicial de la base de datos. |

Actualizar desde la 1.x: coloca tu antiguo `snapotter.db` en `/data/snapotter.db` dentro del volumen y el modo embebido lo importa al PostgreSQL embebido en el primer arranque. La importación se ejecuta una vez; los arranques posteriores la omiten.

Nota sobre telemetría: el modo embebido hereda el valor predeterminado de analítica de la imagen como cualquier otra configuración. La imagen publicada se entrega con la analítica activada; para desactivarla, compila con `--build-arg SNAPOTTER_ANALYTICS=off`, establece `SNAPOTTER_ANALYTICS_DEFAULT=off` antes del primer arranque o usa la exclusión voluntaria de administrador dentro de la app.

### Límites de procesamiento {#processing-limits}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (ilimitado) | Tamaño máximo de archivo por subida en megabytes. Ponlo a 0 para ilimitado. La imagen publicada se distribuye con `0`; una compilación desde el código fuente empieza en 100. |
| `MAX_BATCH_SIZE` | `0` (ilimitado) | Número máximo de archivos en una sola solicitud por lotes. Ponlo a 0 para ilimitado. La imagen publicada se distribuye con `0`; una compilación desde el código fuente empieza en 100. |
| `CONCURRENT_JOBS` | `0` (automático) | Número de tareas por lotes que se ejecutan en paralelo. Ponlo a 0 para detectarlo automáticamente según los núcleos de CPU disponibles. |
| `MAX_MEGAPIXELS` | `0` (sin límite propio) | Resolución máxima de imagen permitida en megapíxeles. Ponlo a 0 para quitar el límite propio de SnapOtter. El decodificador de imágenes sigue rechazando todo lo que supere unos 268 MP (16383 x 16383 píxeles), así que un valor superior a 268 no tiene ningún efecto adicional. |
| `MAX_CPU_UPSCALE_MP` | `4` | Entrada más grande, en megapíxeles, que admite el escalado con IA en un host sin GPU. La salida escalada también está limitada a 16 veces este valor (64 MP por defecto), de modo que un factor de escala alto reduce aún más el límite de entrada. Una imagen mayor se reduce para que quepa antes de escalarla; si eso dejara el resultado sin ser mayor que el original, la solicitud se rechaza. Lanczos omite el límite de entrada pero no el de salida. Ponlo a 0 para que no haya límite, lo que requiere mucha RAM: RealESRGAN siempre construye internamente un búfer 4x. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (ilimitado) | Límite en GB del tamaño combinado de las subidas y los resultados almacenados en el espacio de trabajo. Una vez superado, las subidas y las solicitudes de herramientas reciben un 503 hasta que los archivos caducan tras `FILE_MAX_AGE_HOURS`. Ponlo a 0 para ilimitado; el almacenamiento local sigue rechazando escrituras con un 503 cuando al disco le quedan menos de 0,5 GB libres. La imagen publicada se distribuye con `0`; una compilación desde el código fuente empieza en 10. |
| `MAX_WORKER_THREADS` | `0` (automático) | Máximo de hilos de trabajo para el procesamiento de imágenes. Ponlo a 0 para detectarlo automáticamente según los núcleos de CPU disponibles. |
| `PROCESSING_TIMEOUT_S` | `0` (sin límite) | Tiempo de espera de cada llamada al sidecar de Python que ejecuta las herramientas de IA, en segundos. Ponlo a 0 para que no haya límite. No limita los trabajos de imagen, PDF ni multimedia; de eso se encargan `JOB_TIMEOUT_FAST_S` y `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Segundos que el sidecar de IA de Python y el entorno de OCR preciso permanecen inactivos antes de cerrarse y liberar su memoria (unos 1,3 GB y 0,7 GB una vez en caliente). Ambos se inician de nuevo con la siguiente solicitud, por lo que la primera llamada de IA tras un cierre por inactividad paga el coste de inicio de las bibliotecas, unos segundos. Ponlo a 0 para mantenerlos en ejecución. El valor predeterminado coincide con `AI_SESSION_IDLE_TIMEOUT`, de modo que los modelos cargados no se descartan antes de lo que indica ese ajuste. Si aumentas `AI_SESSION_IDLE_TIMEOUT`, aumenta este valor en la misma medida. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (automático) | Segundos que un modelo de IA cargado permanece en caché en el sidecar tras su último uso. En automático son 600. Lo lee el sidecar de Python, que también descarta todos los modelos en caché cuando termina por `AI_SIDECAR_IDLE_TIMEOUT`. |
| `AI_SESSION_CACHE_BYTES` | `0` (automático) | Presupuesto de memoria para los modelos de IA en caché, en bytes. En automático es el 40 % de la memoria de la GPU, y no hay caché en absoluto en un host solo con CPU. Defínelo en un host con CPU para almacenar modelos en caché en la RAM; ponlo a 1 para desactivar la caché en un host con GPU. Lo lee el sidecar de Python. |
| `MAX_AI_JOBS_PER_USER` | `5` | Trabajos de IA de un solo archivo que un usuario puede tener en cola o en ejecución a la vez. Los demás reciben un `429` hasta que termine uno. El grupo de IA ejecuta un trabajo cada vez, así que esto evita que un usuario lo acapare. Las ejecuciones de IA por lotes y en canalizaciones no cuentan. Ponlo a 0 para ilimitado. |
| `JOB_TIMEOUT_FAST_S` | `120` | Plazo máximo para un trabajo en los pools rápidos (herramientas de imagen y de documentos), en segundos. Un trabajo que dura más falla con un error de tiempo de espera agotado. Ponlo a 0 para que no haya límite. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Plazo máximo para un trabajo en los pools largos (herramientas de IA y multimedia, además de cualquier herramienta marcada como de larga duración), en segundos. Ponlo a 0 para que no haya límite. El OCR de PDF en los modos Balanced y Best amplía su propio plazo según el número de páginas (2 y 5 minutos por página), hasta 6 horas, por lo que un PDF grande no requiere aumentar este valor. |
| `SYNC_WAIT_MS` | `8000` | Cuánto tiempo espera una solicitud de herramienta a su trabajo antes de que la API deje de esperar y devuelva `202` con un id de trabajo que se puede seguir por SSE, en milisegundos. No detiene el trabajo. Ponlo a 0 para esperar al trabajo todo lo que tarde. |
| `MAX_PIPELINE_STEPS` | `20` | Número máximo de pasos en una canalización. Ponlo a 0 para que no haya límite. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Salida más grande que puede pedir un paso de canalización, como ancho por alto en píxeles (el valor predeterminado es 8192 x 8192). Un paso cuyos ajustes piden más se rechaza antes de que se ejecute la canalización. Ponlo a 0 para que no haya límite. |
| `MAX_CANVAS_PIXELS` | `0` (sin límite) | Tamaño máximo del lienzo en píxeles para las imágenes de salida. Ponlo a 0 para que no haya límite. |
| `MAX_SVG_SIZE_MB` | `50` | El SVG más grande que se acepta antes de sanearlo, en megabytes. Aquí `0` se comporta de forma distinta que en las filas de alrededor. Elimina por completo el límite de tamaño previo al análisis en lugar de subirlo, así que deja esta variable con un valor. |
| `MAX_PDF_PAGES` | `0` (ilimitado) | Número máximo de páginas de PDF para la conversión de PDF a imagen. Ponlo a 0 para ilimitado. |
| `MAX_VIDEO_DURATION_S` | `0` (ilimitado) | Vídeo más largo que aceptan las herramientas de vídeo, en segundos. Los archivos más largos se rechazan antes de procesarse, con la duración y el límite en el error. Ponlo a 0 para ilimitado. |
| `MAX_AUDIO_DURATION_S` | `0` (ilimitado) | Lo mismo, para las herramientas de audio. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (ilimitado) | Mayor tasa de bits total que aceptan las herramientas de vídeo, en kilobits por segundo. Ponlo a 0 para ilimitado. |
| `PREVIEW_TIMEOUT_S` | `300` | Límite de tiempo para codificar un clip de vista previa en el navegador de un archivo de vídeo o audio, en segundos. Las vistas previas de documentos usan en su lugar `LIBREOFFICE_TIMEOUT_S`. Ponlo a 0 para que no haya límite. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Límite de tiempo para una conversión de LibreOffice (Word, Excel y PowerPoint a PDF, los convertidores de documentos y las vistas previas de documentos), en segundos. Ponlo a `0` para que no haya límite. |
| `GIF_BG_MAX_FRAMES` | `150` | Máximo de fotogramas que acepta Quitar fondo de GIF en una animación. Las animaciones más largas reciben un `400` que indica el número de fotogramas. Ponlo a 0 para que no haya límite de fotogramas; sigue aplicándose un presupuesto de píxeles aparte. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (desactivado) | Límite de espacio de direcciones, en megabytes, para cada uno de estos procesos auxiliares: ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc y pdfcpu en los motores de medios y documentos, además, para las imágenes, exiftool, los decodificadores y codificadores de HEIF, JPEG XL y JPEG 2000, el decodificador RAW y el decodificador alternativo de ffmpeg. ImageMagick no tiene límite, porque ya tiene sus propios límites de memoria, y el sidecar de IA tampoco. Un proceso que supera el límite se termina en lugar de llevar todo el contenedor al asesino por falta de memoria. Limita la memoria virtual, no la residente, así que fíjalo muy por encima de lo que un proceso usa realmente. El codificador JPEG XL es el que más necesita: una imagen de 24 MP requirió unos 1,8 GB y falló con 1 GB, y más hilos o CPU no cambian mucho eso. Mientras el límite esté definido, el codificador HEIF queda restringido a dos hilos de trabajo, lo que reduce una codificación de 24 MP a unos 0,8 GB a costa de una codificación más lenta. Empieza en `2048` y redúcelo solo después de probar tus archivos más grandes. Ponlo a 0 para desactivarlo y confiar en el límite de memoria del contenedor. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Tamaño máximo del campo `settings` que puede incluir una solicitud de herramienta, en kilobytes, contado en bytes UTF-8. Las solicitudes que superan el límite reciben un `400`. Ponlo a 0 para que no haya límite. Los ajustes reales de las herramientas son mucho menores de 64 KB, así que auméntalo solo si un cliente envía ajustes inusualmente grandes. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Archivo de subtítulos más grande (`.srt`, `.vtt`, `.ass`) que aceptan Grabar subtítulos e Incrustar subtítulos, en megabytes. Los archivos mayores reciben un `400` que indica el tamaño del archivo y el límite. Ponlo a 0 para que no haya límite. Un archivo de subtítulos de una película suele quedar muy por debajo de 1 MB. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Valor más largo que Editar metadatos escribe en una sola etiqueta (artista, descripción, palabras clave, etc.), en caracteres. Los valores más largos reciben un `400` que indica la etiqueta y el límite. Ponlo a 0 para que no haya límite. Súbelo si guardas pies de foto o descripciones largos. El valor de una etiqueta también tiene que caber en `MAX_SETTINGS_PAYLOAD_KB` y en el límite por argumento del sistema operativo (128 KB en Linux). |

### Motores {#engines}

SnapOtter busca cada binario de procesamiento en `$PATH` dentro del contenedor, así que estos quedan vacíos a menos que montes una compilación propia.

| Variable | Predeterminado | Descripción |
|---|---|---|
| `FFMPEG_PATH` | (vacío) | Ruta al binario `ffmpeg` que hay detrás de las herramientas de vídeo y audio. |
| `FFPROBE_PATH` | (vacío) | Ruta a `ffprobe`, que lee los archivos multimedia antes de procesarlos. Apúntalo a la misma compilación que `FFMPEG_PATH`. |
| `QPDF_PATH` | (vacío) | Ruta a `qpdf`, usado por las herramientas de PDF y para comprobar los PDF subidos. |
| `SOFFICE_PATH` | (vacío) | Ruta a `soffice` de LibreOffice, usado para las conversiones de documentos de ofimática. |
| `PDFCPU_PATH` | (vacío) | Ruta a `pdfcpu`, usado por algunas herramientas de PDF. |
| `GS_PATH` | (vacío) | Ruta a `gs` de Ghostscript, usado por las herramientas de PDF y el OCR de PDF. |
| `PANDOC_PATH` | (vacío) | Ruta a `pandoc`, usado en las conversiones de documentos. |
| `SNAPOTTER_FONT_FILE` | (vacío) | Archivo de fuente para el texto dibujado sobre el vídeo (incrustar subtítulos, marca de agua de vídeo). Vacío usa la primera fuente que encuentra la imagen. |
| `SNAPOTTER_FONT_FAMILY` | (vacío) | Nombre de familia de `SNAPOTTER_FONT_FILE`. Vacío significa `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (vacío) | Familia de codificador de vídeo por hardware, `nvenc` o `vaapi`. Vacío codifica por software. |

`SNAPOTTER_HW_ACCEL` necesita un ffmpeg compilado con esa familia de codificadores, y el ffmpeg de la imagen no tiene ninguna de las dos. Con el binario propio de la imagen, el ajuste recurre a la codificación por software y lo indica en el registro de arranque. Para usarlo, monta tu propia compilación de ffmpeg, apunta `FFMPEG_PATH` y `FFPROBE_PATH` a ella, y da al contenedor el dispositivo GPU. Para `nvenc`, establece también `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: la imagen pide solo `compute,utility`, y sin `video` el tiempo de ejecución de NVIDIA no monta la biblioteca de codificación, así que el codificador aparece en la lista pero todas las codificaciones fallan. Una ruta de anulación que no existe o no es ejecutable también se nombra en el registro de arranque, y todas las tareas que necesiten ese binario fallan hasta que corrijas la ruta o la quites.

Los archivos Compose publicados pasan todas ellas desde `.env`, así que basta con establecerlas allí.

### Limpieza {#cleanup}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Cuánto tiempo se conservan los resultados de procesamiento no guardados (subidas en bruto y salidas de herramientas) antes de su eliminación automática. Los archivos que guardas explícitamente en la biblioteca de Archivos no se ven afectados y persisten hasta que los eliminas. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Con qué frecuencia se ejecuta la tarea de limpieza. |
| `JOBS_RETENTION_DAYS` | `30` | Días que se conserva el registro de un trabajo terminado (completado, fallido o cancelado) antes de que la limpieza de retención, que se ejecuta cada 6 horas, lo elimine. Un administrador puede anularlo en Ajustes > Sistema. Los usuarios y equipos con retención legal conservan los suyos. Ponlo a 0 para conservarlos para siempre. |
| `AUDIT_RETENTION_DAYS` | `0` (para siempre) | Días que se conservan las entradas del registro de auditoría. Se aplican las mismas reglas de anulación y retención legal. No se elimina nada mientras el registro de auditoría a prueba de manipulaciones esté activado. Ponlo a 0 para conservarlas para siempre. |

### Licencia empresarial {#enterprise-license}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (vacío) | Clave de licencia que desbloquea las funciones empresariales, como SAML, SCIM y el almacenamiento S3. Se lee al arrancar, así que reinicia tras cambiarla. Una clave no válida o caducada registra una advertencia y el servidor funciona sin ellas. En el contenedor puedes montarla en su lugar mediante `SNAPOTTER_LICENSE_KEY_FILE` (consulta [Secretos de Docker](/es/guide/security#docker-secrets)). |

### Apariencia {#appearance}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema predeterminado para las sesiones nuevas. `light`, `dark` o `system`. |
| `DEFAULT_LOCALE` | `en` | Idioma predeterminado de la interfaz. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Diseño de herramienta predeterminado. `sidebar` o `fullscreen`. |

### Permisos de Docker {#docker-permissions}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `PUID` | `999` | Ejecuta el proceso del contenedor con este UID. Ponlo para que coincida con tu usuario del host en los montajes de enlace (`id -u`). Requiere un sistema de archivos raíz escribible; consulta la [guía de seguridad](/es/guide/security#why-read-only-is-not-set). |
| `PGID` | `999` | Ejecuta el proceso del contenedor con este GID. Ponlo para que coincida con tu grupo del host en los montajes de enlace (`id -g`). Requiere un sistema de archivos raíz escribible; consulta la [guía de seguridad](/es/guide/security#why-read-only-is-not-set). |

## Ejemplo de Docker {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volúmenes {#volumes}

La pila de Docker Compose usa cuatro volúmenes:

- `/data` (app) - Modelos de IA, entorno virtual de Python y archivos de usuario. Móntalo para conservar los archivos subidos y los paquetes de IA instalados entre reinicios.
- `/tmp/workspace` (app) - Almacenamiento temporal para los archivos que se están procesando. Puede ser efímero, pero montarlo evita llenar la capa escribible del contenedor.
- `SnapOtter-pgdata` (postgres) - Directorio de datos de PostgreSQL. Contiene todos los datos relacionales (usuarios, ajustes, canalizaciones, tareas, registro de auditoría). Haz copia de seguridad mediante `pg_dump` o una instantánea del volumen.
- `SnapOtter-redisdata` (redis) - Archivo de solo anexado de Redis para colas de tareas duraderas.
