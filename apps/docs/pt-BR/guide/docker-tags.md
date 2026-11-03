---
description: "Tags de imagem Docker do SnapOtter, benchmarks de GPU, fixação de versão e suporte multiplataforma para AMD64 e ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: b990e4e32de5
i18n_hash_version: 2
---

# Imagem Docker {#docker-image}

O SnapOtter é distribuído como uma única imagem Docker. Execute-a sozinha e ela inicia um PostgreSQL 17 e um Redis embutidos na interface de loopback (modo embutido); para produção, execute-a junto com contêineres separados de PostgreSQL 17 e Redis 8 usando o Compose. A imagem do app funciona em todas as plataformas.

## Início rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Sem `DATABASE_URL` definido, ela roda em modo embutido: o PostgreSQL e o Redis iniciam dentro do contêiner no loopback, com todos os dados no volume `SnapOtter-data`. Defina `DATABASE_URL` e `REDIS_URL` (como faz a stack do [Compose](#docker-compose)) para usar serviços externos. Consulte [Configuração](/pt-BR/guide/configuration#embedded-mode).

## Aceleração NVIDIA CUDA {#nvidia-cuda-acceleration}

A imagem inclui suporte a NVIDIA CUDA em amd64. Se você tem uma GPU NVIDIA com o [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) instalado, adicione `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

A imagem detecta o CUDA automaticamente em tempo de execução. Sem `--gpus all`, ou quando o CUDA não está disponível, as ferramentas de IA rodam na CPU. É a mesma imagem nos dois casos.

A aceleração por iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é compatível com a inferência de IA do SnapOtter atualmente. Mapear `/dev/dri` para dentro do contêiner pode expor o dispositivo de renderização, mas o runtime de IA continuará usando a CPU, a menos que o CUDA esteja disponível.

### Benchmarks {#benchmarks}

Testado em uma NVIDIA RTX 4070 (12 GB de VRAM) com um retrato JPEG de 572x1024.

#### Desempenho com cache aquecido {#warm-performance}

| Ferramenta | CPU | GPU | Ganho |
|------|-----|-----|---------|
| Remoção de fundo (u2net) | 2.415ms | 879ms | 2,7x |
| Remoção de fundo (isnet) | 2.457ms | 1.137ms | 2,2x |
| Ampliação 2x | 350ms | 309ms | 1,1x |
| Ampliação 4x | 910ms | 310ms | 2,9x |
| Desfoque de rostos | 139ms | 122ms | 1,1x |

#### Início a frio (primeira requisição após iniciar o contêiner) {#cold-start-first-request-after-container-start}

| Ferramenta | CPU | GPU | Ganho |
|------|-----|-----|---------|
| Remoção de fundo | 22.286ms | 4.792ms | 4,7x |
| Ampliação 2x | 3.957ms | 2.318ms | 1,7x |

O OCR não está incluído na comparação com CUDA. Tanto a camada Tesseract integrada quanto as camadas opcionais RapidOCR/ONNX usam a CPU, inclusive quando o contêiner tem acesso à GPU NVIDIA.

### Verificação de integridade do CUDA {#cuda-health-check}

Após a primeira requisição de IA, o endpoint de integridade de administrador informa o status da GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

A stack Compose completa inclui o app, o PostgreSQL 17 e o Redis 8. Consulte [Implantação](/pt-BR/guide/deployment) para o `docker-compose.yml` completo. Um exemplo mínimo:

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
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

Para a aceleração NVIDIA CUDA via Docker Compose, adicione a seção deploy ao serviço do SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Fixação de versão {#version-pinning}

| Tag | Descrição |
|-----|------------|
| `latest` | Último release |
| `2.2.0` | Versão exata |
| `2.2` | Último patch da 2.2.x |
| `2` | Última minor da 2.x |

## Plataformas {#platforms}

| Arquitetura | Suporte a GPU | Observações |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Aceleração CUDA completa para ferramentas de IA |
| linux/arm64 | Somente CPU | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migração de tags anteriores {#migration-from-previous-tags}

Se você usava a tag `:cuda`, mude para `:latest` e mantenha `--gpus all`. O mesmo suporte a GPU, em uma imagem unificada.

Seus dados e configurações são preservados nos volumes.
