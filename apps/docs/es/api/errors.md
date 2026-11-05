---
title: "Códigos de error"
description: "La estructura del cuerpo de error, los códigos estables y qué hacer ante cada uno."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 81834a7bc92a
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

La cuenta de administrador de la primera ejecución es `admin` con la contraseña `admin`, a menos que `DEFAULT_USERNAME` o `DEFAULT_PASSWORD` la hayan cambiado. A menos que `SKIP_MUST_CHANGE_PASSWORD` esté definido, esa cuenta recibe `MUST_CHANGE_PASSWORD` en cada llamada hasta que se cambie la contraseña.

## Trabajos {#job-codes}

Un trabajo que falla informa su motivo en el propio trabajo, no en el error HTTP. Lea `error.code` y `error.message` desde `GET /api/v1/jobs/{jobId}`. Consulte [Seguimiento del progreso](/es/api/rest#progress-tracking).

## Aún sin catalogar {#not-yet-cataloged}

Los códigos que generan funciones individuales (por ejemplo cifrado, OIDC, SCIM y equipos) todavía no se describen en esta página. Cada uno es un código estable; trate un código no listado como opaco y gestiónelo según su estado.
