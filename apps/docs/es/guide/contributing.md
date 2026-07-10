---
description: "Cómo contribuir a SnapOtter. Informes de errores, solicitudes de funciones, pull requests y requisitos del CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: 27b5c04c8d90
---

# Contribuir {#contributing}

Gracias por tu interés en contribuir. Esta guía cubre cómo participar, qué aceptamos y cómo empezar.

## Formas de contribuir {#ways-to-contribute}

### Issues (sin configuración) {#issues-no-setup-required}

- **Informes de errores** - ¿Algo no funciona? Abre un [informe de error](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) con los pasos para reproducirlo.
- **Solicitudes de funciones** - ¿Tienes una idea? Inicia una [discusión](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) para que la comunidad opine y la vote.
- **Problemas de traducción** - ¿Detectas una traducción incorrecta o faltante? Abre un [issue de traducción](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Problemas de documentación** - ¿Algo raro en la documentación? Abre un [issue de documentación](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Código (requiere CLA) {#code-requires-cla}

Aceptamos pull requests para:

| Tipo | Proceso |
|------|---------|
| Correcciones de errores | Abre un PR directamente (enlaza el issue si existe) |
| Nuevas traducciones | Abre un PR directamente (consulta la [Guía de traducción](/es/guide/translations)) |
| Mejoras de documentación | Abre un PR directamente |
| Mejoras en la cobertura de pruebas | Abre un PR directamente |
| Nuevas herramientas o funciones | Inicia primero una [discusión](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas); un mantenedor convierte las ideas aprobadas en un issue con seguimiento antes de que escribas código |
| Refactorizaciones o cambios de arquitectura | Inicia primero una [discusión](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) y espera la aprobación de un mantenedor antes de escribir código |

### Lo que no aceptaremos {#what-we-will-not-accept}

- Cambios en los flujos de trabajo de CI/CD, la configuración de release o la configuración del linter/compilador
- PRs sin un [Acuerdo de Licencia de Contribuidor](#contributor-license-agreement) firmado
- PRs con más de 400 líneas de cambios (divide el trabajo grande en PRs más pequeños)
- Funciones que no se hayan discutido y aprobado antes
- Cambios en `packages/ai/` sin discusión previa

## Acuerdo de Licencia de Contribuidor {#contributor-license-agreement}

Antes de poder fusionar tu primer PR, debes firmar nuestro [CLA Individual](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md). Es un requisito único.

**Por qué:** SnapOtter tiene licencia dual (AGPLv3 + comercial). El CLA nos otorga el derecho a distribuir tus contribuciones bajo ambas licencias. Conservas la plena titularidad de los derechos de autor sobre tu trabajo.

**Cómo:** Cuando abras tu primer PR, el bot CLA Assistant comentará con un enlace. Haz clic en él, revisa el acuerdo y fírmalo con tu cuenta de GitHub. Tarda 30 segundos.

Si contribuyes en nombre de tu empleador y este conserva los derechos de propiedad intelectual sobre tu trabajo, contacta con contact@snapotter.com para gestionar un CLA Corporativo antes de enviar tu contribución.

## Cómo empezar {#getting-started}

### Requisitos previos {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (solo para herramientas de IA)
- Docker (opcional, para pruebas de integración completas)

### Configuración {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### Ejecutar comprobaciones {#running-checks}

Antes de enviar un PR, asegúrate de que todas las comprobaciones pasen localmente:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Proceso de pull request {#pull-request-process}

1. Haz un fork del repositorio y crea una rama a partir de `main` (`feat/my-feature` o `fix/issue-123`)
2. Realiza tus cambios en commits enfocados y revisables usando [conventional commits](https://www.conventionalcommits.org/)
3. Añade o actualiza pruebas para tus cambios
4. Ejecuta `pnpm lint && pnpm typecheck && pnpm test` localmente
5. Abre un PR contra `main` y rellena la plantilla
6. Firma el CLA si se te solicita
7. Espera a que CI pase y a que un mantenedor lo revise

### Qué esperar de la revisión {#review-expectations}

- Intentamos responder a los PRs en un plazo de 7 días
- Los PRs pequeños y enfocados se revisan más rápido
- Si no recibes respuesta en 7 días, deja un comentario mencionando el hilo
- Podemos solicitar cambios, sugerir un enfoque diferente o cerrar el PR si no encaja con la dirección del proyecto

### Después de que se fusione tu PR {#after-your-pr-is-merged}

Tu contribución se incluirá en la siguiente versión y se acreditará en el changelog.

## Buenos primeros issues {#good-first-issues}

¿Buscas en qué trabajar? Revisa nuestros [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) para tareas aptas para principiantes, o [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) para tareas más grandes en las que agradeceríamos la ayuda de la comunidad.

## Estilo de código {#code-style}

- Biome se encarga del formato y el linting (comillas dobles, punto y coma, indentación de 2 espacios)
- El hook de pre-commit ejecuta `biome check --write` automáticamente sobre los archivos en staging
- Si el linter se queja, corrige el código (no modifiques la configuración de Biome)
- Módulos ES en todas partes (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Para los detalles completos de la arquitectura, consulta la [Guía del desarrollador](/es/guide/developer).

## Seguridad {#security}

**No abras un PR o issue público para vulnerabilidades de seguridad.** Repórtalas de forma privada a través de [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) o por correo a contact@snapotter.com. Consulta [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) para todos los detalles.

## ¿Preguntas? {#questions}

- [Documentación](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
