---
title: "Códigos de error"
description: "La estructura del cuerpo de error, los códigos estables y qué hacer ante cada uno."
i18n_source_hash: dd2420de1d32
i18n_provenance: machine
i18n_output_hash: 51d4e102672e
i18n_hash_version: 2
---

# Códigos de error {#error-codes}

Toda respuesta de error JSON tiene la misma estructura:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Campo | Siempre presente | Significado |
|-------|----------------|---------|
| `error` | Sí | Un mensaje legible para personas. Es seguro mostrarlo a los usuarios. No lo analice. |
| `code` | Sí | Un código estable y legible por máquina. Base su lógica en este valor. |
| `requestId` | Sí | El ID que el servidor asigna a esta solicitud. Cítelo cuando reporte un problema; coincide con el registro del servidor. |
| `details` | A veces | Más contexto para algunos errores 4xx, como el mensaje de validación. |

Los mensajes pueden cambiar entre versiones. Los códigos no, así que escriba la lógica del cliente en torno a `code`.

## Códigos derivados del estado HTTP {#status-codes}

Cuando una ruta no define su propio código, el servidor lo deriva del estado:

| Estado HTTP | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Cualquier otro 4xx recurre a `BAD_REQUEST`, y cualquier otro 5xx a `INTERNAL_ERROR`.

Una ruta puede definir un código más específico, y entonces la respuesta lleva ese código en su lugar. Por ejemplo, una herramienta que no puede ejecutarse porque falta su paquete de IA devuelve un código propio de la función. Esos códigos se describen junto con la función que los genera.

## Autenticación y acceso {#auth-codes}

| `code` | Estado | Qué hacer |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Envíe `Authorization: Bearer <token>` con un token de sesión o una clave de API (`si_...`). |
| `FORBIDDEN` | 403 | La credencial es válida pero carece del permiso. Pida el permiso a un administrador. |
| `MUST_CHANGE_PASSWORD` | 403 | La cuenta debe cambiar su contraseña antes de poder llamar a otros endpoints. Llame a `POST /api/auth/change-password` con el token de sesión y vuelva a intentarlo. |
| `USER_DISABLED` | 403 | La cuenta está deshabilitada. Un administrador debe volver a habilitarla. |
| `LOGIN_THROTTLED` | 429 | Demasiados intentos fallidos de inicio de sesión. Espere antes de volver a intentarlo. |
| `VALIDATION_ERROR` | 400 | El cuerpo o los parámetros de la solicitud no superaron la validación. `details` indica el problema. |

La cuenta de administrador de la primera ejecución es `admin` con la contraseña `admin`, a menos que `DEFAULT_USERNAME` o `DEFAULT_PASSWORD` la hayan cambiado. A menos que `SKIP_MUST_CHANGE_PASSWORD` esté definido, esa cuenta recibe `MUST_CHANGE_PASSWORD` en cada llamada hasta que se cambie la contraseña.

## Trabajos {#job-codes}

Un trabajo que falla informa su motivo en el propio trabajo, no en el error HTTP. Lea `error.code` y `error.message` desde `GET /api/v1/jobs/{jobId}`. Consulte [Seguimiento del progreso](/es/api/rest#progress-tracking).

Un trabajo fallido conserva `error.code` solo cuando el fallo es un error de entrada o una falla del servidor. Los demás fallos incluyen únicamente el mensaje.

| `code` | Significado | Qué hacer |
|--------|---------|------------|
| `CANCELED` | Un usuario canceló el trabajo. No es un estado HTTP. Los eventos de progreso llevan `phase: failed` con este código. | Trátelo como una cancelación del usuario. No lo reintente automáticamente. |
| `INPUT_MISSING` | La entrada se eliminó antes de que se ejecutara el trabajo. | Suba el archivo de nuevo. |
| `ENGINE_UNAVAILABLE` | Un motor necesario no pudo iniciarse en el servidor. | Reintente cuando un administrador repare la instalación. |
| `JOB_STALLED` | No se devuelve a los clientes; etiqueta el informe de errores del servidor. El worker perdió el bloqueo del trabajo más veces de las que permite la cola, normalmente porque el servidor se reinició o se quedó sin memoria o CPU. El trabajo falla con un mensaje que indica que fue interrumpido. | Reintente. Si sigue ocurriendo, dé más memoria al servidor o reduzca `CONCURRENT_JOBS`. |

## Autenticación y MFA {#mfa-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | La política de MFA exige el registro, y esta instancia no puede registrar al usuario (sin licencia enterprise). Las instancias con licencia devuelven 200 con `requiresMfaEnrollment: true` y guían al usuario durante el registro. | No reintente. Un administrador debe cambiar la política o usar la CLI de recuperación sin conexión. |
| `MFA_POLICY_UNAVAILABLE` | 503 | El servidor no pudo leer la política de MFA durante el inicio de sesión. | Reintente el inicio de sesión en breve. |
| `INVALID_CODE` | 401 | El código TOTP o de recuperación es incorrecto. | Pida al usuario un código nuevo y reintente. Los fallos repetidos terminan en `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Demasiados códigos incorrectos. El desafío se descarta. | Inicie sesión de nuevo para obtener un desafío nuevo. |
| `MFA_EXPIRED` | 401 | El desafío de MFA o de registro expiró o no coincide. | Inicie sesión de nuevo. |
| `MFA_NOT_CONFIGURED` | 401 | La cuenta no tiene secreto TOTP, por lo que no se puede comprobar un código. | Registre MFA antes de iniciar sesión con un código. |
| `MFA_ALREADY_ENABLED` | 409 | MFA ya está activo en la cuenta. | No vuelva a registrarlo. |
| `NO_PENDING_ENROLLMENT` | 400 | Llegó una confirmación de registro sin un registro pendiente. | Llame primero al endpoint de registro. |
| `MFA_NOT_ENABLED` | 400 | La acción requiere que MFA esté activado, y está desactivado para este usuario. | Omita la acción o active MFA primero. |
| `MFA_DECRYPTION_FAILED` | 500 | El secreto TOTP almacenado no se puede descifrar. | Acción del operador. Normalmente significa que la clave de cifrado cambió. Revise `DATA_ENCRYPTION_KEY` y `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Un valor almacenado (una configuración, un encabezado de autenticación de webhook o un secreto TOTP) no se puede descifrar. | Acción del operador, como arriba. No reintente. |
| `IDLE_TIMEOUT` | 401 | La sesión expiró tras un período de inactividad. | Inicie sesión de nuevo. |
| `INVALID_PASSWORD` | 401 | La contraseña actual es incorrecta en un cambio de contraseña. | Pida al usuario la contraseña actual. |
| `PASSWORD_CHANGED` | 409 | La contraseña cambió en otra sesión, o un administrador la restableció, mientras se ejecutaba esta solicitud. | Inicie sesión de nuevo. |
| `OIDC_NO_PASSWORD` | 400 | Se solicitó un cambio o restablecimiento de contraseña para una cuenta creada mediante SSO. | Dirija al usuario al proveedor de identidad. |

## OIDC {#oidc-codes}

Los fallos de OIDC durante el inicio de sesión no devuelven un cuerpo JSON. La ruta de inicio de sesión redirige a la página de inicio de sesión con un motivo genérico, y el registro de auditoría guarda el código. La ruta de cierre de sesión sigue finalizando la sesión local cuando no se puede contactar con el proveedor de identidad.

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Ninguno (redirección) | La URL del emisor es `http`, pero `EXTERNAL_URL` es `https`, por lo que el cliente rechaza el descubrimiento. | Administrador: sirva el emisor mediante `https`, o ejecute la instancia mediante `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Ninguno (redirección) | El descubrimiento del emisor agotó el tiempo de espera. | Compruebe que el servidor pueda llegar al emisor y reintente. |
| `OIDC_DISCOVERY_FAILED` | Ninguno (redirección) | El descubrimiento falló por otro motivo. | Revise la URL del emisor y el acceso saliente del servidor. |
| `OIDC_END_SESSION_INVALID` | Ninguno (el cierre de sesión continúa) | El `end_session_endpoint` del proveedor de identidad no es una URL válida. La sesión local se borra igualmente. | Administrador: corrija los metadatos del proveedor. |
| `OIDC_END_SESSION_SCHEME` | Ninguno (el cierre de sesión continúa) | El `end_session_endpoint` usa un esquema que el servidor no permite. La sesión local se borra igualmente. | Administrador: corrija los metadatos del proveedor. |

## SAML {#saml-codes}

Los fallos de SAML no definen un `code`. Una aserción fallida redirige a la página de inicio de sesión con `saml_auth_failed`, y el evento de auditoría `SAML_LOGIN_FAILED` registra el motivo.

## SCIM {#scim-codes}

Las rutas SCIM responden con el sobre de error de la RFC 7644 (`schemas`, `detail`, `status` y, a veces, `scimType`). No definen `code`. Base su lógica en el estado HTTP.

## Equipos, roles y usuarios {#team-role-codes}

Los nombres de equipo o de rol duplicados devuelven el `CONFLICT` genérico, y un equipo o rol inexistente devuelve `NOT_FOUND`.

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | El rol de quien llama no permite el cambio. El objetivo está por encima de su autoridad, el rol es integrado o la solicitud otorga permisos que quien llama no posee. | No reintente. Pídalo a un usuario con más autoridad. |
| `UNKNOWN_ROLE` | 400 | El ID de rol no coincide con ningún rol existente. | Corrija el ID de rol. Liste los roles para encontrarlo. |
| `UNKNOWN_TEAM` | 400 | El ID de equipo no coincide con ningún equipo existente. | Corrija el ID de equipo. |
| `SELF_DEMOTE` | 400 | Un administrador intentó quitarse su propio rol de administrador. | Pida a otro administrador que haga el cambio. |
| `SELF_DELETE` | 400 | Un administrador intentó eliminar su propia cuenta. | Pida a otro administrador que la elimine. |
| `LAST_ADMIN` | 400 en rutas de usuarios, 409 en rutas de purga GDPR | El cambio dejaría sin administradores, o purgaría un equipo que contiene a todos los administradores. | Convierta primero a otro usuario en administrador. |
| `USER_LIMIT_REACHED` | 403 | La instancia alcanzó su límite de `MAX_USERS`. | Elimine un usuario o aumente `MAX_USERS`. |

## Funciones y paquetes de IA {#feature-codes}

Las herramientas, ejecuciones por lotes y pipelines que necesitan un paquete de IA opcional usan estos códigos.

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501, o 400 desde el modo de rostros de Smart Crop | La herramienta, o un paso de un pipeline o lote, necesita un paquete que no está instalado. El cuerpo incluye `feature` (el ID del paquete) y `featureName`. | Instale el paquete en Configuración y reintente. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Se rechazó una instalación o importación sin conexión porque las bibliotecas x86-64 del paquete necesitan AVX y la CPU de este servidor no lo tiene. No se descargó ni se instaló nada. El cuerpo incluye `feature` (el ID del paquete) y `reason` (`cpu-no-avx`). `GET /api/v1/features` informa del mismo paquete con `compatibility: "incompatible"` y `compatibilityReason: "cpu-no-avx"`. | Ejecute SnapOtter en una CPU con AVX, o en arm64. Los demás paquetes se siguen instalando. |
| `FEATURE_INCOMPATIBLE` | 501, o 400 cuando Fast OCR recibe un idioma que no puede leer | La función instalada no puede ofrecer la calidad o el idioma solicitados. | Cambie la configuración o instale un paquete que lo admita. |
| `ENGINE_UNAVAILABLE` | 503 | Un motor necesario no pudo iniciarse, o se eliminó un runtime de OCR después de validar la solicitud. | Reintente cuando un administrador repare o reinstale la función. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium no está instalado, por lo que HTML a imagen no puede ejecutarse. | Pida a un administrador que instale el navegador. |
| `BROWSER_CRASHED` | 503 | El navegador de capturas falló durante el renderizado. | Reintente la solicitud. |

## Herramientas {#tool-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | La entrada subida se eliminó antes de que se ejecutara el trabajo. | Suba el archivo de nuevo y envíe el trabajo. |
| `ANALYSIS_EXPIRED` | 410 | El análisis de la foto de pasaporte expiró antes de la generación. | Analice la foto de nuevo y luego genere. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | El resultado de la eliminación de fondo expiró antes del paso siguiente. | Elimine el fondo de nuevo. |
| `NOT_ANIMATED` | 400 | Remove GIF Background recibió una imagen fija. | Use Remove Background para imágenes fijas. |
| `TOO_MANY_FRAMES` | 400 | La animación tiene más fotogramas de los que permite el servidor (`GIF_BG_MAX_FRAMES`). | Envíe una animación más corta o pida a un administrador que aumente el límite. |
| `TOO_MANY_PIXELS` | 400 | El lienzo de la animación multiplicado por su número de fotogramas supera el límite del servidor: 268,402,689 píxeles (16383 x 16383) para Remove GIF Background, o el tope de carga de trabajo GIF para otras herramientas animadas. | Envíe menos fotogramas o una animación más pequeña. |
| `IMAGE_TOO_LARGE` | 400 | La imagen tiene más píxeles de los que acepta el decodificador. | Envíe una imagen más pequeña. |
| `RESULT_TOO_LARGE` | 400 | La configuración produciría una imagen mayor de lo que permite el codificador o el límite de píxeles. | Use una imagen más pequeña o una configuración que genere un resultado menor. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice o pandoc no pudo abrir el documento. Puede estar dañado, protegido con contraseña o no ser del formato que indica su extensión. | Compruebe que el archivo se abre en una aplicación ofimática y envíelo de nuevo. |
| `PDF_DAMAGED` | 400 | El motor de PDF encontró una estructura de documento rota. | Pase el archivo por Repair PDF y reintente. |
| `PDF_PASSWORD_PROTECTED` | 400 | El PDF está cifrado y esta herramienta no puede abrirlo. | Desbloquéelo primero con Unlock PDF. |
| `NO_AUDIO_TRACK` | 400 | El archivo no tiene flujo de audio que pueda usar una herramienta de audio. | Envíe un archivo que tenga audio. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg no pudo leer el audio o el video: no encontró paquetes, ni parámetros del códec, ni el átomo `moov`, o encontró datos que no puede analizar. | Compruebe que el archivo se reproduce en un reproductor multimedia, o expórtelo de nuevo, y reintente. |
| `PAGE_OUT_OF_RANGE` | 400 | El rango de páginas nombra una página que el PDF no tiene. | Revise el número de páginas y envíe un rango que esté dentro de él. |
| `INVALID_PAGE_RANGE` | 400 | El rango de páginas no tiene una sintaxis válida. | Use números de página como `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Se pidió a Remove Pages que eliminara todas las páginas. | Conserve al menos una página. |
| `NESTING_TOO_DEEP` | 400 | El JSON o XML está anidado a más de 100 niveles de profundidad. | Aplane el documento y luego conviértalo. |
| `IMAGE_UNDECODABLE` | 400 | No se puede decodificar la imagen, o no se pueden leer sus dimensiones. El archivo puede estar dañado o usar una codificación que el decodificador no admite. | Exporte la imagen de nuevo desde otra aplicación, o conviértala primero a PNG o JPEG. |
| `INVALID_SETTINGS` | 400 | Una configuración está fuera de rango o no se ajusta a este archivo: un recorte fuera de la imagen, un cambio de tamaño a cero, un fotograma GIF que la animación no tiene, una especificación de pasaporte que no existe. El texto de `error` nombra la configuración. | Corrija la configuración indicada en `error` y reintente. |
| `CHART_DATA_INVALID` | 400 | Chart Maker no pudo leer los datos del gráfico del archivo: el CSV o JSON no se analiza, no tiene columna numérica, tiene más de 100 filas o tiene un valor negativo. El texto de `error` indica cuál. | Envíe un CSV o JSON con hasta 100 filas, cada una con una etiqueta y un número mayor o igual a cero. |
| `NO_FACE_DETECTED` | 400 | Passport Photo no encontró ningún rostro en la imagen. | Envíe una foto nítida, de frente y con buena iluminación. |
| `TARGET_SIZE_UNREACHABLE` | 400 | La compresión, o el límite de tamaño de una foto de pasaporte, no puede dejar el archivo por debajo del tamaño solicitado, ni siquiera reduciendo su escala. | Pida un tamaño objetivo mayor o recorte primero la imagen. |
| `TOO_MANY_PAGES` | 400 | Se pidió a OCR más páginas de las que procesa en un solo trabajo. | Seleccione menos páginas con el rango de páginas. |
| `METADATA_DAMAGED` | 400 | Edit Metadata encontró dañados los datos EXIF existentes de la imagen, por lo que no puede reescribirlos de forma segura. | Elimine primero los metadatos con Remove Image Metadata y luego edite. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML o Markdown a PDF encontró una referencia a una imagen, hoja de estilos o fuente en la red, que el servidor no descarga. | Incruste el recurso en el archivo (por ejemplo como URI `data:`) y reintente. |

## Archivos {#file-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Guardar en Archivos superaría la cuota de almacenamiento del usuario. | Elimine archivos o pida más espacio a un administrador. |
| `INVALID_STORED_NAME` | 400 | El servidor rechazó el nombre de un archivo almacenado. | Suba el archivo de nuevo. |

## Pipelines y lotes {#pipeline-codes}

Las solicitudes de pipeline y de lote devuelven los códigos de función anteriores para cada paso que necesita un paquete. Un ID de trabajo que ya está en uso devuelve `CONFLICT` con estado 409. Envíe un ID de trabajo nuevo.

## Configuración {#settings-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | La clave no es una configuración conocida. | Revise el nombre de la clave. |
| `READONLY_SETTING` | 400 | La configuración no se puede cambiar mediante la API. | Cámbiela mediante el entorno o la interfaz de administración. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | El nuevo valor entra en conflicto con otras configuraciones. El cuerpo nombra la configuración en `setting` y enumera los problemas en `validationErrors`. | Corrija las configuraciones indicadas y reintente. |
| `SETTING_DECRYPTION_FAILED` | 500 | Una configuración almacenada no se puede descifrar. | Acción del operador, como con `DECRYPTION_FAILED`. |

Para `VALIDATION_ERROR` en una configuración, `details` contiene los problemas del esquema.

## Enterprise {#enterprise-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | La configuración o política necesita una licencia enterprise, como la imposición de SSO o la política de MFA. | Use una instancia con licencia o deje la configuración desactivada. |
| `IP_NOT_ALLOWED` | 403 | La dirección IP de la solicitud no está en la lista de permitidos. | Conéctese desde una red permitida. |
| `INVALID_CIDR` | 400 | Una entrada de la lista de permitidos no es un CIDR válido. El mensaje enumera las entradas incorrectas. | Corrija las entradas y guarde de nuevo. |
| `SELF_LOCKOUT` | 400 | Guardar la lista de permitidos bloquearía la IP actual de quien llama. | Agregue primero su IP actual a la lista. |

Las rutas de purga GDPR devuelven un `CONFLICT` simple con estado 409 cuando un usuario o equipo está bajo retención legal.

## Códigos que los clientes no reciben {#internal-codes}

Estos códigos existen en el código fuente del servidor para registros, telemetría o los propios errores de Fastify. Un cliente no los recibe en el cuerpo de una respuesta ni en una fila de trabajo, así que no escriba lógica de cliente en torno a ellos.

| `code` | Adónde va |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Se informa al seguimiento de errores desde el evaluador de alertas. No se puede descifrar el encabezado de autenticación de un webhook de alertas. |
| `SIEM_DECRYPTION_FAILED` | Se informa al seguimiento de errores desde el reenvío a SIEM. No se puede descifrar el encabezado de autenticación del SIEM. |
| `WEBHOOK_DECRYPTION_FAILED` | Se informa al seguimiento de errores. La solicitud que sufrió el mismo fallo responde con `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Se informa al seguimiento de errores cuando no se puede eliminar una subida en preparación. |
| `USERNAME_RACE_EXHAUSTED` | Se genera cuando la creación automática de SSO pierde la carrera por el nombre de usuario en cada reintento. La página de inicio de sesión muestra un error en su lugar. |
| `ERR_OUT_OF_RANGE` | Lo lanza el lector de almacenamiento de objetos para un rango de bytes no válido. |
| `ETIMEDOUT` | Se define en el error de tiempo de espera de una exportación GDPR. La exportación falla y se puede solicitar de nuevo. |
| `FST_REQ_FILE_TOO_LARGE` | Código de Fastify para una subida que supera el límite. Los clientes reciben un 413 con `PAYLOAD_TOO_LARGE`, o el propio mensaje 413 de la ruta. |
| `TARGET_SIZE_EXCEEDED` | Se lanza cuando una compresión con tamaño objetivo no alcanza su objetivo. El error no tiene estado ni código, así que los clientes reciben un fallo genérico. |
| `OCR_CACHE_PERMISSIONS` | Se informa al seguimiento de errores como fallo operativo cuando el volumen de datos de IA deja el caché del runtime de OCR con permisos de escritura para todos. El trabajo de instalación falla con un mensaje que nombra el problema de almacenamiento. |
| `OCR_RUNTIME_UNREACHABLE` | Se informa al seguimiento de errores como fallo operativo cuando el servidor nunca llegó a huggingface.co para descargar el runtime de OCR. El trabajo de instalación falla con un mensaje sobre el acceso a la red, `HTTPS_PROXY` y la importación sin conexión. |
