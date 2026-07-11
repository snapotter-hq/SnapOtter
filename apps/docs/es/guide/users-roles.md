---
description: "Gestiona usuarios, roles integrados y personalizados, permisos, claves de API, equipos, sesiones y el registro de auditoría en SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: a2ceae4b73a7
---

# Usuarios, roles y permisos {#users-roles-permissions}

SnapOtter incluye tres roles integrados, 17 permisos granulares y compatibilidad con roles personalizados con control de acceso opcional por herramienta. Esta página cubre el modelo de autorización completo, el alcance de las claves de API, la gestión de equipos y el registro de auditoría.

::: tip Páginas relacionadas
[OIDC / SSO](/es/guide/oidc) | [SAML SSO](/es/guide/saml) | [Aprovisionamiento SCIM](/es/guide/scim) | [Seguridad y fortalecimiento](/es/guide/security)
:::

## Usuarios {#users}

### Crear usuarios {#creating-users}

Los administradores pueden crear usuarios a través del panel de administración o el endpoint `POST /api/auth/register`. Cada usuario tiene un nombre de usuario, un rol, una asignación de equipo y una dirección de correo electrónico opcional.

### Administrador predeterminado {#default-admin}

En el primer arranque, SnapOtter crea una cuenta de administrador predeterminada. Las credenciales provienen de variables de entorno:

| Variable | Predeterminado | Descripción |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Nombre de usuario de la cuenta de administrador inicial |
| `DEFAULT_PASSWORD` | `admin` | Contraseña de la cuenta de administrador inicial |

Se requiere que el administrador predeterminado cambie su contraseña en el primer inicio de sesión.

### Proveedores de autenticación {#authentication-providers}

Los usuarios pueden autenticarse mediante varios métodos:

- **Local**: nombre de usuario y contraseña almacenados en la base de datos de SnapOtter
- **OIDC**: cualquier proveedor de OpenID Connect (consulta [OIDC / SSO](/es/guide/oidc))
- **SAML**: proveedores de identidad SAML 2.0 (consulta [SAML SSO](/es/guide/saml))
- **SCIM**: aprovisionamiento automatizado desde un proveedor de identidad (consulta [Aprovisionamiento SCIM](/es/guide/scim))

### Desactivar la autenticación {#disabling-authentication}

Establece `AUTH_ENABLED=false` para desactivar por completo la autenticación. En este modo se usa un usuario anónimo sintético con el rol `admin` para todas las solicitudes. No se requiere inicio de sesión.

::: warning 
Desactivar la autenticación otorga acceso total de administrador a cualquiera que pueda alcanzar la instancia. Úsalo solo en entornos de confianza.
:::

## Roles integrados {#built-in-roles}

SnapOtter incluye tres roles integrados. No se pueden modificar ni eliminar.

### Administrador {#admin}

Los 17 permisos. Control total sobre la instancia.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 permisos. Puede usar todas las herramientas y gestionar todos los archivos y pipelines, pero no puede acceder a las funciones de administración.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### Usuario {#user}

5 permisos. Puede usar herramientas y gestionar sus propios recursos.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Referencia de permisos {#permissions-reference}

| Permiso | Descripción |
|---|---|
| `tools:use` | Usar cualquier herramienta de procesamiento |
| `files:own` | Ver y gestionar los archivos propios |
| `files:all` | Ver y gestionar los archivos de todos los usuarios |
| `apikeys:own` | Crear y gestionar las claves de API propias |
| `apikeys:all` | Ver las claves de API de todos los usuarios |
| `pipelines:own` | Crear y gestionar los pipelines propios |
| `pipelines:all` | Ver y gestionar los pipelines de todos los usuarios |
| `settings:read` | Ver la configuración de la instancia |
| `settings:write` | Modificar la configuración de la instancia |
| `users:manage` | Crear, actualizar y eliminar cuentas de usuario |
| `teams:manage` | Crear, actualizar y eliminar equipos |
| `features:manage` | Instalar y gestionar bundles de funciones de IA |
| `system:health` | Acceder a los endpoints de estado y disponibilidad |
| `audit:read` | Ver el registro de auditoría y listar roles |
| `compliance:manage` | Gestionar el ciclo de vida de RGPD y las funciones de cumplimiento |
| `webhooks:manage` | Configurar webhooks salientes |
| `security:manage` | Gestionar la configuración de seguridad (lista de IP permitidas, imposición de SSO) |

## Roles personalizados {#custom-roles}

Los administradores con el permiso `security:manage` pueden crear roles personalizados a través del panel de administración o la API de roles. Listar roles requiere `audit:read`.

### Crear un rol personalizado {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Los nombres de rol deben tener entre 2 y 30 caracteres, alfanuméricos en minúscula con guiones y guiones bajos.

### Permisos reservados para administradores {#admin-reserved-permissions}

Tres permisos están reservados para los roles integrados y no pueden asignarse a roles personalizados:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

La API de roles rechaza cualquier solicitud que incluya estos permisos. Solo el rol integrado `admin` tiene acceso a ellos.

### Permisos a nivel de herramienta {#tool-level-permissions}

Los roles personalizados pueden restringir opcionalmente a qué herramientas pueden acceder los usuarios. Hay dos modos disponibles:

| Modo | Comportamiento | Requisito de licencia |
|---|---|---|
| `category` | Restringir por modalidad (imagen, video, audio, documento, archivo) | Ninguno (gratis) |
| `tool` | Restringir por ID de herramienta individual | Requiere la función empresarial `per_tool_permissions` |

Cuando el modo `tool` está establecido pero la función empresarial no está disponible, SnapOtter se degrada de forma controlada y permite el acceso a todas las herramientas.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Eliminar un rol personalizado {#deleting-a-custom-role}

Cuando se elimina un rol personalizado, todos los usuarios asignados a él se reasignan automáticamente al rol `user`.

## Equipos {#teams}

Los equipos agrupan usuarios para la gestión de almacenamiento y retención. Se crea un equipo `Default` en el primer arranque.

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | cadena | Nombre de equipo único (1-50 caracteres) |
| `storageQuota` | número | Límite de almacenamiento por equipo en bytes (funciona sin la edición empresarial) |
| `retentionHours` | número | Eliminar automáticamente las salidas tras esta cantidad de horas (requiere `team_retention_overrides`, empresarial) |
| `legalHold` | booleano | Impedir la eliminación automática de los archivos de los miembros del equipo (requiere `legal_hold`, empresarial) |

::: info 
El equipo `Default` no se puede eliminar. Los equipos que aún tienen miembros no se pueden eliminar. Reasigna primero a los miembros.
:::

## Claves de API {#api-keys}

Los usuarios pueden generar claves de API para el acceso programático. Cada clave usa el prefijo `si_` y se muestra una sola vez en el momento de la creación.

### Permisos con alcance {#scoped-permissions}

Las claves de API pueden llevar opcionalmente un array `permissions`. Cuando se establece, los permisos efectivos de una solicitud son la **intersección** de los permisos del rol del usuario y los permisos con alcance de la clave. Esto significa que una clave de API nunca puede escalar más allá de los propios permisos del usuario.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Caducidad {#expiration}

Las claves aceptan una marca de tiempo `expiresAt` opcional. Las claves caducadas se rechazan en el momento de la autenticación.

## Registro de auditoría {#audit-log}

SnapOtter registra los eventos relevantes para la seguridad en un registro de auditoría estructurado, almacenado en la tabla de base de datos `audit_log`.

### Ver el registro de auditoría {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Requiere el permiso `audit:read`. Admite paginación (`page`, `limit`) y filtros (`action`, `ip`, `from`, `to`).

### Auditoría de operaciones de herramientas {#tool-operation-auditing}

::: warning 
Los eventos `TOOL_EXECUTED` **no** se registran de forma predeterminada. Son de participación voluntaria mediante cualquiera de dos vías:

1. Establecer la configuración de administrador `auditToolOperations` en `true`.
2. Tener una licencia activa con la función `audit_export` (disponible tanto en los planes team como enterprise).

Sin una de estas, las ejecuciones individuales de herramientas no se registran en el registro de auditoría.
:::

### Exportar {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Requiere el permiso `audit:read` y la función empresarial `audit_export` (disponible tanto en los planes team como enterprise). Admite los formatos CSV y JSON, filtrados por `action`, `actorId`, `targetType`, `targetId`, `from` y `to`.

### Firma resistente a la manipulación {#tamper-resistant-signing}

Cuando está habilitado, cada entrada del registro de auditoría se firma con un HMAC derivado de `DATA_ENCRYPTION_KEY`. Esto requiere:

1. Establecer `DATA_ENCRYPTION_KEY` en tu entorno.
2. Habilitar la configuración de administrador `tamperResistantAudit`.
3. Una licencia empresarial con la función `tamper_resistant_audit`.

### Retención {#retention}

Establece `AUDIT_RETENTION_DAYS` para purgar automáticamente las entradas antiguas. El valor predeterminado es `0`, lo que significa que las entradas se conservan indefinidamente.

### Referencia de eventos {#event-reference}

| Evento | Categoría |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Autenticación |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Autenticación |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Autenticación |
| `LOGOUT` | Autenticación |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Gestión de usuarios |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Gestión de usuarios |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roles |
| `API_KEY_CREATED`, `API_KEY_DELETED` | Claves de API |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Configuración |
| `FILE_UPLOADED`, `FILE_DELETED` | Archivos |
| `TOOL_EXECUTED` | Herramientas (participación voluntaria) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Cumplimiento |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Cumplimiento |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuración |

## Gestión de sesiones {#session-management}

Las sesiones se basan en cookies, controladas por `SESSION_DURATION_HOURS` (predeterminado: 168 horas / 7 días).

### Los cambios de rol invalidan las sesiones {#role-changes-invalidate-sessions}

Cuando un administrador cambia el rol de un usuario, todas las sesiones activas de ese usuario se eliminan. El usuario debe iniciar sesión de nuevo para adoptar sus nuevos permisos.

### Salvaguardas {#safety-guards}

- **Protección del último administrador**: el último administrador que queda no puede ser degradado a un rol inferior. La API devuelve un error si lo intentas.
- **Prevención de autoeliminación**: los administradores no pueden eliminar su propia cuenta a través de la API.
