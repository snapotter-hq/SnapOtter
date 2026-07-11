---
description: "Configura el inicio de sesión único SAML 2.0 para SnapOtter. Guías paso a paso para Okta, Azure AD / Entra ID, Google Workspace y otros proveedores de identidad SAML."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 7df44433f34c
---

# SAML SSO {#saml-sso}

SnapOtter admite SAML 2.0 para el inicio de sesión único. Los usuarios pueden iniciar sesión mediante un proveedor de identidad externo (Okta, Azure AD / Entra ID, Google Workspace o cualquier IdP SAML 2.0 estándar) en lugar de la autenticación local con usuario y contraseña.

::: tip Función empresarial
SAML SSO requiere una licencia **team** o **enterprise** con la función `saml_sso`. Si `SAML_ENABLED=true` está definido sin una licencia válida, las rutas SAML se omiten silenciosamente y se registra una advertencia.
:::

## Requisitos previos {#prerequisites}

- Una instancia de SnapOtter en ejecución accesible en una URL pública
- `EXTERNAL_URL` definido con esa URL pública (p. ej. `https://photos.example.com`)
- Una clave de licencia team o enterprise con la función `saml_sso`
- Acceso de administrador a tu proveedor de identidad SAML

## Inicio rápido {#quick-start}

Añade estas variables de entorno a tu `docker-compose.yml`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Reinicia el contenedor. Aparece un botón "Iniciar sesión con SAML" (o la etiqueta definida por `SAML_PROVIDER_NAME`) en la página de inicio de sesión.

## Referencia de configuración {#configuration-reference}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `SAML_ENABLED` | `false` | Habilita el inicio de sesión SAML. |
| `SAML_IDP_SSO_URL` | | URL del endpoint SSO del IdP. **Obligatorio** cuando SAML está habilitado. |
| `SAML_IDP_CERTIFICATE` | | Certificado de firma X.509 del IdP en formato PEM (el texto del certificado en sí, no una ruta de archivo). **Obligatorio** cuando SAML está habilitado. |
| `EXTERNAL_URL` | | La URL pública donde SnapOtter es accesible. **Obligatorio** cuando SAML está habilitado. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI enviado al IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL del Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Crea automáticamente una cuenta de usuario local en el primer inicio de sesión SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | Vincula una identidad SAML a un usuario local existente si la dirección de correo electrónico coincide. |
| `SAML_DEFAULT_ROLE` | `user` | Rol asignado a los usuarios SAML creados automáticamente. Uno de `admin`, `editor` o `user`. |
| `SAML_PROVIDER_NAME` | | Etiqueta visible del botón de inicio de sesión SAML en el frontend (p. ej. "Okta", "Azure AD"). Si está vacía, el botón muestra "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | Atributo de la aserción SAML usado como nombre de usuario. Si está vacío, recurre a la parte local del correo electrónico y luego al NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Atributo de la aserción SAML usado como dirección de correo electrónico del usuario. |

El servidor se niega a arrancar si `SAML_ENABLED=true` y falta alguna de las tres variables obligatorias (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`).

::: details Notas de seguridad
Tanto `wantAuthnResponseSigned` como `wantAssertionsSigned` están fijados de forma permanente en `true`. SnapOtter rechaza las respuestas SAML sin firmar o firmadas incorrectamente. Las aserciones de un IdP de confianza se tratan como correo electrónico verificado.

Solo se admite el inicio de sesión iniciado por el SP. SnapOtter no admite el inicio de sesión iniciado por el IdP (no solicitado) ni el Single Logout (SLO). Cerrar sesión en SnapOtter no cierra la sesión del usuario en el IdP.
:::

## Metadatos y URL del SP {#sp-metadata-and-urls}

Tu IdP necesita tres valores de SnapOtter:

| Campo | Valor |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Por ejemplo, si `EXTERNAL_URL` es `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Endpoint de metadatos: `https://photos.example.com/api/auth/saml/metadata` (devuelve XML)

Algunos IdP pueden importar directamente la URL de metadatos del SP, lo que rellena automáticamente la ACS URL y el Entity ID.

## Configuración del proveedor {#provider-setup}

### Okta {#okta}

1. En la consola de administración de Okta, ve a **Applications > Create App Integration**.
2. Selecciona **SAML 2.0** y haz clic en **Next**.
3. Asigna un nombre (p. ej. "SnapOtter") y haz clic en **Next**.
4. Configura los ajustes de SAML:
   - **Single sign-on URL**: Tu ACS URL (p. ej. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Tu Entity ID (p. ej. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. En **Attribute Statements**, añade `email` mapeado a `user.email`.
6. Haz clic en **Next** y luego en **Finish**.
7. Ve a la pestaña **Sign On**, haz clic en **View SAML setup instructions** y copia:
   - **Identity Provider Single Sign-On URL** en `SAML_IDP_SSO_URL`
   - **X.509 Certificate** en `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. En el portal de Azure, ve a **Microsoft Entra ID > Enterprise applications > New application**.
2. Haz clic en **Create your own application**, nómbrala "SnapOtter" y selecciona **Integrate any other application you don't find in the gallery**.
3. Ve a **Single sign-on > SAML** y haz clic en **Edit** en la sección **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Tu Entity ID (p. ej. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Tu ACS URL (p. ej. `https://photos.example.com/api/auth/saml/callback`)
4. En **SAML Certificates**, descarga el **Certificate (Base64)**.
5. En **Set up SnapOtter**, copia la **Login URL**.
6. Define `SAML_IDP_SSO_URL` con la Login URL y `SAML_IDP_CERTIFICATE` con el contenido del certificado descargado.
7. Asigna usuarios o grupos a la aplicación en **Users and groups**.

### Google Workspace {#google-workspace}

1. En la consola de administración de Google, ve a **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Nombra la aplicación "SnapOtter" y haz clic en **Continue**.
3. En la página **Google Identity Provider details**, copia la **SSO URL** y descarga el **Certificate**. Haz clic en **Continue**.
4. Configura los detalles del Service Provider:
   - **ACS URL**: Tu ACS URL (p. ej. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Tu Entity ID (p. ej. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Haz clic en **Continue** y luego en **Finish**.
6. Activa la aplicación (**ON**) para tus unidades organizativas.
7. Define `SAML_IDP_SSO_URL` con la SSO URL del paso 3 y `SAML_IDP_CERTIFICATE` con el contenido del certificado descargado.

### IdP SAML 2.0 genérico {#generic-saml-2-0-idp}

Para cualquier proveedor de identidad compatible con SAML 2.0:

1. Crea una nueva aplicación/proveedor de servicios SAML en tu IdP.
2. Define la **ACS URL** como `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Define el **Entity ID** / **Audience** como `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Configura el IdP para enviar el correo electrónico del usuario en un atributo llamado `email` (o define `SAML_EMAIL_ATTRIBUTE` para que coincida con el nombre del atributo de tu IdP).
5. Copia la **URL SSO del IdP** y el **certificado de firma** en `SAML_IDP_SSO_URL` y `SAML_IDP_CERTIFICATE`.

## Aprovisionamiento de usuarios {#user-provisioning}

### Creación automática {#auto-create}

Cuando `SAML_AUTO_CREATE_USERS` es `true` (el valor predeterminado), se crea una cuenta de usuario local la primera vez que alguien inicia sesión mediante SAML. El rol se establece en `SAML_DEFAULT_ROLE`.

El nombre de usuario se deriva en este orden:

1. El valor del atributo de aserción especificado por `SAML_USERNAME_ATTRIBUTE` (si está definido y presente)
2. La parte local de la dirección de correo electrónico (todo lo que precede a `@`)
3. El NameID de SAML

Si se produce una colisión de nombre de usuario, se añade un sufijo numérico (p. ej. `jane` pasa a ser `jane_2`).

### Vinculación automática {#auto-link}

Cuando `SAML_AUTO_LINK_USERS` es `true`, SnapOtter vincula una identidad SAML a una cuenta local existente si las direcciones de correo electrónico coinciden. Esto resulta útil cuando tienes cuentas de usuario creadas de antemano y quieres que empiecen a usar SSO sin perder sus datos.

::: warning 
Habilita la vinculación automática solo si confías en que tu IdP SAML verifica las direcciones de correo electrónico. Un correo electrónico no verificado de un IdP mal configurado podría permitir que alguien se apropie de la cuenta de otro usuario.
:::

### Mapeo de atributos {#attribute-mapping}

| Campo de SnapOtter | Origen | Configuración |
|---|---|---|
| Correo electrónico | Atributo de aserción | `SAML_EMAIL_ATTRIBUTE` (predeterminado: `email`) |
| Nombre de usuario | Atributo de aserción, correo electrónico o NameID | `SAML_USERNAME_ATTRIBUTE` (consulta el orden de derivación más arriba) |
| ID externo | NameID | Siempre el NameID de SAML, no configurable |

## Aplicación forzosa de SSO {#sso-enforcement}

Si quieres exigir que todos los usuarios inicien sesión mediante SAML (u OIDC) y bloquear el inicio de sesión local con contraseña, habilita la aplicación forzosa de SSO:

1. Asegúrate de que la función empresarial `sso_enforcement` tenga licencia (disponible en los planes team y enterprise).
2. En **Admin Settings > Security**, activa **SSO Enforcement**.
3. Define un **nombre de usuario break-glass**: es la única cuenta local que aún puede iniciar sesión con contraseña, para acceso de emergencia si el IdP es inaccesible.

Cuando la aplicación forzosa de SSO está activa, cualquier intento de inicio de sesión local (salvo el usuario break-glass) devuelve un error 403 con el mensaje "Local password login is disabled. Please use SSO."

::: tip 
Configura siempre un nombre de usuario break-glass antes de habilitar la aplicación forzosa de SSO. Sin él, podrías quedar bloqueado fuera de SnapOtter si tu IdP se cae.
:::

## Usar SAML junto con OIDC {#using-saml-alongside-oidc}

SAML y OIDC pueden habilitarse simultáneamente. Cuando ambos están activos, la página de inicio de sesión muestra botones separados para cada proveedor (etiquetados por `SAML_PROVIDER_NAME` y `OIDC_PROVIDER_NAME`). Los usuarios pueden iniciar sesión con cualquiera de los métodos.

Ambos proveedores comparten los ajustes de creación automática, vinculación automática y aplicación forzosa de SSO de forma independiente: cada uno tiene sus propias variables `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` y `*_DEFAULT_ROLE`.

## Solución de problemas {#troubleshooting}

### Falló la validación de la aserción {#assertion-validation-failed}

No se pudo verificar la firma de la respuesta SAML o de la aserción. Comprueba:

- El certificado en `SAML_IDP_CERTIFICATE` coincide con el certificado de firma actual de tu IdP (los certificados rotan, así que verifica la caducidad)
- El certificado está en formato PEM (comienza con `-----BEGIN CERTIFICATE-----`)
- El certificado es el texto completo, no una ruta de archivo
- La ACS URL y el Entity ID configurados en tu IdP coinciden exactamente con los valores de SnapOtter (esquema, host, puerto, ruta)

### Atributos ausentes {#missing-attributes}

Si los nombres de usuario o los correos electrónicos están vacíos tras el inicio de sesión, es posible que tu IdP no esté enviando los atributos esperados. Comprueba:

- Tu IdP está configurado para liberar un atributo `email` (o el que sea que esté definido en `SAML_EMAIL_ATTRIBUTE`)
- Si usas `SAML_USERNAME_ATTRIBUTE`, verifica que ese atributo esté incluido en la aserción
- Algunos IdP requieren configuración explícita del mapeo de atributos antes de liberar los claims

### Desfase de reloj {#clock-skew}

Las aserciones SAML incluyen condiciones de marca de tiempo (`NotBefore`, `NotOnOrAfter`). Si el reloj de tu servidor y el del IdP están desincronizados, la validación de la aserción falla. Ejecuta NTP en ambas máquinas para mantener los relojes alineados.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Esta advertencia aparece en los registros del servidor cuando `SAML_ENABLED=true` pero la licencia no incluye la función `saml_sso`. Verifica tu clave de licencia y tu plan. La función `saml_sso` está disponible en los planes team y enterprise.

### El inicio de sesión redirige de vuelta con un error {#login-redirects-back-with-error}

Si al hacer clic en el botón de inicio de sesión SAML te redirige de vuelta a la página de inicio de sesión con un error, revisa los registros del servidor para conocer los detalles. Causas comunes:

- La URL SSO del IdP es inaccesible desde el servidor
- El IdP rechazó la petición de autenticación (revisa los registros de auditoría del IdP)
- El IdP devolvió una respuesta sin firmar (SnapOtter requiere que tanto la respuesta como la aserción estén firmadas)
