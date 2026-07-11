---
description: "Tags de imagem Docker do SnapOtter, benchmarks de GPU, fixação de versão e suporte multiplataforma para AMD64 e ARM64."
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 5f53a19b9daf
---

# Imagem Docker {#docker-image}

O SnapOtter é distribuído como uma única imagem Docker. Execute-a sozinha e ela inicia um PostgreSQL 17 e um Redis embutidos na interface de loopback (modo embutido); para produção, execute-a ao lado de contêineres separados de PostgreSQL 17 e Redis 8 com o Compose. A imagem do app funciona em todas as plataformas.

## Início rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Sem nenhum `DATABASE_URL` definido, isso roda em modo embutido: o PostgreSQL e o Redis iniciam dentro do contêiner no loopback, com todos os dados sob o volume `SnapOtter-data`. Defina `DATABASE_URL` e `REDIS_URL` (como a pilha do [Compose](#docker-compose) faz) para usar serviços externos em vez disso. Veja [Configuração](/pt-BR/guide/configuration#embedded-mode).

## Aceleração NVIDIA CUDA {#nvidia-cuda-acceleration}

A imagem inclui suporte a NVIDIA CUDA em amd64. Se você tem uma GPU NVIDIA com o [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) instalado, adicione `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

A imagem detecta automaticamente o CUDA em tempo de execução. Sem `--gpus all`, ou quando o CUDA não está disponível, as ferramentas de IA rodam na CPU. É a mesma imagem em ambos os casos.

Aceleração de iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é suportada para inferência de IA do SnapOtter hoje. Mapear `/dev/dri` para dentro do contêiner pode expor o dispositivo de renderização, mas o runtime de IA ainda usará a CPU a menos que o CUDA esteja disponível.

### Benchmarks {#benchmarks}

Testado em uma NVIDIA RTX 4070 (12 GB de VRAM) com um retrato JPEG de 572x1024.

#### Desempenho aquecido {#warm-performance}

| Ferramenta | CPU | GPU | Ganho de velocidade |
|------|-----|-----|---------|
| Remoção de fundo (u2net) | 2.415ms | 879ms | 2,7x |
| Remoção de fundo (isnet) | 2.457ms | 1.137ms | 2,2x |
| Upscale 2x | 350ms | 309ms | 1,1x |
| Upscale 4x | 910ms | 310ms | 2,9x |
| OCR (PaddleOCR) | 137ms | 94ms | 1,5x |
| Desfoque de rosto | 139ms | 122ms | 1,1x |

#### Inicialização a frio (primeira requisição após o início do contêiner) {#cold-start-first-request-after-container-start}

| Ferramenta | CPU | GPU | Ganho de velocidade |
|------|-----|-----|---------|
| Remoção de fundo | 22.286ms | 4.792ms | 4,7x |
| Upscale 2x | 3.957ms | 2.318ms | 1,7x |
| OCR (PaddleOCR) | 1.469ms | 1.090ms | 1,3x |

### Verificação de integridade do CUDA {#cuda-health-check}

Após a primeira requisição de IA, o endpoint de integridade do administrador informa o status da GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

A pilha completa do Compose inclui o app, o PostgreSQL 17 e o Redis 8. Veja [Implantação](/pt-BR/guide/deployment) para o `docker-compose.yml` completo. Um exemplo mínimo:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

Para aceleração NVIDIA CUDA via Docker Compose, adicione a seção deploy ao serviço do SnapOtter:

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
| `latest` | Última versão |
| `1.11.0` | Versão exata |
| `1.11` | Último patch na 1.11.x |
| `1` | Última versão menor na 1.x |

## Plataformas {#platforms}

| Arquitetura | Suporte a GPU | Notas |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Aceleração CUDA completa para ferramentas de IA |
| linux/arm64 | Apenas CPU | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migração a partir de tags anteriores {#migration-from-previous-tags}

Se você estava usando a tag `:cuda`, mude para `:latest` e mantenha `--gpus all`. Mesmo suporte a GPU, imagem unificada.

Seus dados e configurações são preservados nos volumes.
