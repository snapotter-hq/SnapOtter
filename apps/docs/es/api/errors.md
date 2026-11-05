---
title: "Códigos de error"
description: "La estructura del cuerpo de error, los códigos estables y qué hacer ante cada uno."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: a7c781d89aba
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
|-------|------------------|-------------|
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

La cuenta de administrador de la primera ejecución es `admin` con la contraseña `admin`, salvo que `DEFAULT_USERNAME` o `DEFAULT_PASSWORD` la hayan cambiado. Si no se define `SKIP_MUST_CHANGE_PASSWORD`, esa cuenta recibe `MUST_CHANGE_PASSWORD` en cada llamada hasta que cambie la contraseña.

## Trabajos {#job-codes}

Un trabajo que falla informa su motivo en el propio trabajo, no en el error HTTP. Lea `error.code` y `error.message` de `GET /api/v1/jobs/{jobId}`. Consulte [Seguimiento del progreso](/es/api/rest#progress-tracking).

Un trabajo fallido conserva `error.code` solo cuando el fallo es un error de entrada o un fallo del servidor. Los demás fallos incluyen únicamente el mensaje.

| `code` | Significado | Qué hacer |
|--------|---------|------------|
| `CANCELED` | Un usuario canceló el trabajo. No es un estado HTTP. Los eventos de progreso llevan `phase: failed` con este código. | Trátelo como una cancelación del usuario. No lo reintente automáticamente. |
| `INPUT_MISSING` | La entrada se eliminó antes de que se ejecutara el trabajo. | Suba el archivo de nuevo. |
| `ENGINE_UNAVAILABLE` | Un motor necesario no pudo iniciarse en el servidor. | Reintente después de que un administrador repare la instalación. |

## Autenticación y MFA {#mfa-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | La política de MFA exige el registro, y esta instancia no puede registrar al usuario (no hay licencia enterprise). Las instancias con licencia devuelven 200 con `requiresMfaEnrollment: true` y guían al usuario durante el registro. | No reintente. Un administrador debe cambiar la política o usar la CLI de recuperación sin conexión. |
| `MFA_POLICY_UNAVAILABLE` | 503 | El servidor no pudo leer la política de MFA durante el inicio de sesión. | Reintente el inicio de sesión en breve. |
| `INVALID_CODE` | 401 | El código TOTP o de recuperación es incorrecto. | Pida al usuario un código nuevo y reintente. Los fallos repetidos terminan en `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Demasiados códigos incorrectos. El desafío se descarta. | Inicie sesión de nuevo para obtener un desafío nuevo. |
| `MFA_EXPIRED` | 401 | El desafío de MFA o de registro expiró o no coincide. | Inicie sesión de nuevo. |
| `MFA_NOT_CONFIGURED` | 401 | La cuenta no tiene secreto TOTP, así que no se puede comprobar un código. | Registre MFA antes de iniciar sesión con un código. |
| `MFA_ALREADY_ENABLED` | 409 | MFA ya está activo en la cuenta. | No vuelva a registrarlo. |
| `NO_PENDING_ENROLLMENT` | 400 | Llegó una confirmación de registro sin un registro pendiente. | Llame primero al endpoint de registro. |
| `MFA_NOT_ENABLED` | 400 | La acción requiere que MFA esté activado, y está desactivado para este usuario. | Omita la acción o active MFA primero. |
| `MFA_DECRYPTION_FAILED` | 500 | No se puede descifrar el secreto TOTP almacenado. | Acción del operador. Normalmente significa que cambió la clave de cifrado. Revise `DATA_ENCRYPTION_KEY` y `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | No se puede descifrar un valor almacenado (un ajuste, un encabezado de autenticación de webhook o un secreto TOTP). | Acción del operador, como arriba. No reintente. |
| `IDLE_TIMEOUT` | 401 | La sesión expiró tras un periodo de inactividad. | Inicie sesión de nuevo. |
| `INVALID_PASSWORD` | 401 | La contraseña actual es incorrecta en un cambio de contraseña. | Pida al usuario su contraseña actual. |
| `PASSWORD_CHANGED` | 409 | La contraseña cambió en otra sesión, o un administrador la restableció, mientras se ejecutaba esta solicitud. | Inicie sesión de nuevo. |
| `OIDC_NO_PASSWORD` | 400 | Se solicitó un cambio o restablecimiento de contraseña para una cuenta creada mediante SSO. | Dirija al usuario al proveedor de identidad. |

## OIDC {#oidc-codes}

Los fallos de OIDC durante el inicio de sesión no devuelven un cuerpo JSON. La ruta de inicio de sesión redirige a la página de acceso con un motivo genérico, y el registro de auditoría guarda el código. La ruta de cierre de sesión sigue finalizando la sesión local cuando no se puede contactar con el proveedor de identidad.

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Ninguno (redirección) | La URL del emisor es `http`, pero `EXTERNAL_URL` es `https`, así que el cliente rechaza el descubrimiento. | Administrador: sirva el emisor por `https`, o ejecute la instancia por `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Ninguno (redirección) | Se agotó el tiempo de espera del descubrimiento del emisor. | Compruebe que el servidor puede llegar al emisor y reintente. |
| `OIDC_DISCOVERY_FAILED` | Ninguno (redirección) | El descubrimiento falló por otro motivo. | Revise la URL del emisor y el acceso saliente del servidor. |
| `OIDC_END_SESSION_INVALID` | Ninguno (el cierre de sesión continúa) | El `end_session_endpoint` del proveedor de identidad no es una URL válida. La sesión local se borra de todos modos. | Administrador: corrija los metadatos del proveedor. |
| `OIDC_END_SESSION_SCHEME` | Ninguno (el cierre de sesión continúa) | El `end_session_endpoint` usa un esquema que el servidor no permite. La sesión local se borra de todos modos. | Administrador: corrija los metadatos del proveedor. |

## SAML {#saml-codes}

Los fallos de SAML no definen un `code`. Una aserción fallida redirige a la página de acceso con `saml_auth_failed`, y el evento de auditoría `SAML_LOGIN_FAILED` registra el motivo.

## SCIM {#scim-codes}

Las rutas SCIM responden con el sobre de error de la RFC 7644 (`schemas`, `detail`, `status` y, a veces, `scimType`). No definen `code`. Base su lógica en el estado HTTP.

## Equipos, roles y usuarios {#team-role-codes}

Los nombres de equipo o de rol duplicados devuelven el genérico `CONFLICT`, y un equipo o rol inexistente devuelve `NOT_FOUND`.

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | El rol de quien llama no permite el cambio. El objetivo tiene más autoridad que quien llama, el rol es integrado, o la solicitud concede permisos que quien llama no tiene. | No reintente. Pida ayuda a un usuario con más autoridad. |
| `UNKNOWN_ROLE` | 400 | El ID del rol no coincide con ningún rol existente. | Corrija el ID del rol. Liste los roles para encontrarlo. |
| `UNKNOWN_TEAM` | 400 | El ID del equipo no coincide con ningún equipo existente. | Corrija el ID del equipo. |
| `SELF_DEMOTE` | 400 | Un administrador intentó quitarse su propio rol de administrador. | Pida a otro administrador que haga el cambio. |
| `SELF_DELETE` | 400 | Un administrador intentó eliminar su propia cuenta. | Pida a otro administrador que la elimine. |
| `LAST_ADMIN` | 400 en las rutas de usuarios, 409 en las rutas de purga RGPD | El cambio dejaría la instancia sin administradores, o purgaría un equipo que reúne a todos los administradores. | Convierta primero a otro usuario en administrador. |
| `USER_LIMIT_REACHED` | 403 | La instancia alcanzó su límite de `MAX_USERS`. | Elimine un usuario o aumente `MAX_USERS`. |

## Funciones y paquetes de IA {#feature-codes}

Las herramientas, ejecuciones por lotes y pipelines que necesitan un paquete de IA opcional usan estos códigos.

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | La herramienta, o un paso de un pipeline o lote, necesita un paquete que no está instalado. El cuerpo incluye `feature` (el ID del paquete) y `featureName`. | Instale el paquete en Ajustes y reintente. |
| `FEATURE_INCOMPATIBLE` | 501 | La función instalada no puede ofrecer la calidad o el idioma solicitados. | Cambie el ajuste o instale un paquete que lo admita. |
| `ENGINE_UNAVAILABLE` | 503 | Un motor necesario no pudo iniciarse, o se eliminó un entorno de ejecución de OCR después de validar la solicitud. | Reintente después de que un administrador repare o reinstale la función. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium no está instalado, así que HTML a imagen no puede ejecutarse. | Pida a un administrador que instale el navegador. |
| `BROWSER_CRASHED` | 503 | El navegador de capturas falló durante el renderizado. | Reintente la solicitud. |

## Herramientas {#tool-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | La entrada subida se eliminó antes de que se ejecutara el trabajo. | Suba el archivo de nuevo y envíe el trabajo. |
| `ANALYSIS_EXPIRED` | 410 | El análisis de la foto de pasaporte expiró antes de la generación. | Analice la foto de nuevo y luego genere. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | El resultado de la eliminación de fondo expiró antes del paso siguiente. | Elimine el fondo de nuevo. |
| `NOT_ANIMATED` | 400 | Eliminar fondo de GIF recibió una imagen fija. | Use Eliminar fondo para imágenes fijas. |
| `TOO_MANY_FRAMES` | 400 | La animación tiene más fotogramas de los que permite el servidor (`GIF_BG_MAX_FRAMES`). | Envíe una animación más corta o pida a un administrador que aumente el límite. |

## Archivos {#file-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Guardar en Archivos superaría la cuota de almacenamiento del usuario. | Elimine archivos o pida más espacio a un administrador. |
| `INVALID_STORED_NAME` | 400 | El servidor rechazó el nombre de un archivo almacenado. | Suba el archivo de nuevo. |

## Pipelines y lotes {#pipeline-codes}

Las solicitudes de pipelines y lotes devuelven los códigos de función anteriores en cada paso que necesita un paquete. Un ID de trabajo que ya está en uso devuelve `CONFLICT` con el estado 409. Envíe un ID de trabajo nuevo.

## Ajustes {#settings-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | La clave no es un ajuste conocido. | Revise el nombre de la clave. |
| `READONLY_SETTING` | 400 | El ajuste no se puede cambiar mediante la API. | Cámbielo mediante el entorno o la interfaz de administración. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | El nuevo valor entra en conflicto con otros ajustes. El cuerpo indica el ajuste en `setting` y enumera los problemas en `validationErrors`. | Corrija los ajustes indicados y reintente. |
| `SETTING_DECRYPTION_FAILED` | 500 | No se puede descifrar un ajuste almacenado. | Acción del operador, como en `DECRYPTION_FAILED`. |

Para `VALIDATION_ERROR` en un ajuste, `details` contiene los problemas del esquema.

## Enterprise {#enterprise-codes}

| `code` | Estado | Significado | Qué hacer |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | El ajuste o la política necesita una licencia enterprise, como la imposición de SSO o la política de MFA. | Use una instancia con licencia o deje el ajuste desactivado. |
| `IP_NOT_ALLOWED` | 403 | La dirección IP de la solicitud no está en la lista de permitidas. | Conéctese desde una red permitida. |
| `INVALID_CIDR` | 400 | Una entrada de la lista de permitidas no es un CIDR válido. El mensaje enumera las entradas incorrectas. | Corrija las entradas y guarde de nuevo. |
| `SELF_LOCKOUT` | 400 | Guardar la lista de permitidas bloquearía la IP actual de quien llama. | Agregue primero su IP actual a la lista. |

Las rutas de purga RGPD devuelven un `CONFLICT` simple con el estado 409 cuando un usuario o equipo está bajo retención legal.

## Códigos que los clientes no reciben {#internal-codes}

Estos códigos existen en el código fuente del servidor para registros, telemetría o los propios errores de Fastify. Un cliente no los recibe en un cuerpo de respuesta ni en una fila de trabajo, así que no base su lógica en ellos.

| `code` | Adónde va |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | El evaluador de alertas lo reporta al seguimiento de errores. No se puede descifrar el encabezado de autenticación del webhook de una alerta. |
| `SIEM_DECRYPTION_FAILED` | El reenvío a SIEM lo reporta al seguimiento de errores. No se puede descifrar el encabezado de autenticación del SIEM. |
| `WEBHOOK_DECRYPTION_FAILED` | Se reporta al seguimiento de errores. La solicitud que encontró el mismo fallo responde con `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Se reporta al seguimiento de errores cuando no se puede eliminar una subida en preparación. |
| `USERNAME_RACE_EXHAUSTED` | Se genera cuando la creación automática de SSO pierde la carrera por el nombre de usuario en todos los reintentos. La página de acceso muestra un error en su lugar. |
| `ERR_OUT_OF_RANGE` | Lo lanza el lector del almacenamiento de objetos para un rango de bytes no válido. |
| `ETIMEDOUT` | Se define en el error de tiempo de espera de una exportación RGPD. La exportación falla y se puede solicitar de nuevo. |
| `FST_REQ_FILE_TOO_LARGE` | El código de Fastify para una subida que supera el límite. Los clientes reciben un 413 con `PAYLOAD_TOO_LARGE`, o el propio mensaje 413 de la ruta. |
| `TARGET_SIZE_EXCEEDED` | Se lanza cuando una compresión por tamaño objetivo no alcanza su objetivo. El error no tiene estado ni código, así que los clientes reciben un fallo genérico. |
