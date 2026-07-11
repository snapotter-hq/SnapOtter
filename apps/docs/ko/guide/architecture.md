---
description: "SnapOtter의 모노레포 구조, 앱 및 패키지 아키텍처, 요청 라이프사이클, 리소스 사용량."
i18n_source_hash: 9e8f80499a37
i18n_provenance: human
i18n_output_hash: 90a5f3b46d1e
---

# 아키텍처 {#architecture}

SnapOtter는 pnpm 워크스페이스와 Turborepo로 관리되는 모노레포입니다. SnapOtter 앱 이미지, PostgreSQL 17, Redis 8의 3개 컨테이너 Docker Compose 스택으로 배포됩니다.

## 프로젝트 구조 {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## 패키지 {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

[Sharp](https://sharp.pixelplumbing.com/) 위에 구축된 핵심 이미지 처리 라이브러리입니다. 크기 조정, 크롭, 회전, 뒤집기, 변환, 압축, 메타데이터 제거, 색상 조정(밝기, 대비, 채도, 그레이스케일, 세피아, 반전, 색상 채널) 등 AI가 아닌 모든 작업을 처리합니다.

이 패키지는 네트워크 의존성이 없으며 완전히 인프로세스로 실행됩니다.

### `@snapotter/ai` {#snapotter-ai}

ML 작업을 위해 Python 스크립트를 호출하는 브리지 계층입니다. 최초 사용 시 브리지는 무거운 라이브러리(PIL, NumPy, MediaPipe, rembg)를 미리 임포트하는 영구 Python 디스패처 프로세스를 시작하므로 이후 AI 호출은 임포트 오버헤드를 건너뜁니다. 디스패처가 아직 준비되지 않은 경우 브리지는 요청마다 새 Python 서브프로세스를 생성하는 방식으로 폴백합니다.

**모델은 사전 로드되지 않습니다.** 각 도구 스크립트는 요청 시점에 디스크에서 모델 가중치를 로드하고 요청이 끝나면 이를 해제합니다. 전체 메모리 프로필은 [리소스 사용량](#resource-footprint)을 참고하세요.

지원 작업: 배경 제거(rembg/BiRefNet), 업스케일(RealESRGAN), 얼굴 블러(MediaPipe), 얼굴 보정(GFPGAN/CodeFormer), 개체 지우기(LaMa ONNX), OCR(PaddleOCR/Tesseract), 컬러화(DDColor), 노이즈 제거, 적목 제거, 사진 복원, 여권 사진 생성, 투명도 수정(BiRefNet HR-matting), 콘텐츠 인식 크기 조정(Go caire 바이너리).

Python 스크립트는 `packages/ai/python/`에 있습니다. Docker 이미지는 빌드 중 모든 모델 가중치를 미리 다운로드하므로 컨테이너가 완전히 오프라인으로 작동합니다.

### `@snapotter/shared` {#snapotter-shared}

프런트엔드와 백엔드 모두에서 사용하는 공유 TypeScript 타입, 상수(`APP_VERSION` 및 도구 정의 등), i18n 번역 문자열입니다.

## 애플리케이션 {#applications}

### API (`apps/api`) {#api-apps-api}

다섯 가지 모달리티(image, video, audio, PDF, file)에 걸친 241개의 도구 경로를 노출하는 Fastify v5 서버로, 다음을 처리합니다.
- 파일 업로드, 임시 워크스페이스 관리, 영구 파일 저장
- 버전 체인(`user_files` 테이블)이 있는 사용자 파일 라이브러리 - 각 처리 결과는 원본 파일로 다시 연결되고 어떤 도구가 적용되었는지 기록하며, Files 페이지를 위한 썸네일이 자동 생성됩니다
- 도구 실행(각 도구 요청을 이미지 엔진 또는 AI 브리지로 라우팅)
- 파이프라인 오케스트레이션(여러 도구를 순차적으로 연결)
- BullMQ 작업 큐(풀: image, media, ai, docs, system)를 통한 동시성 제어가 있는 배치 처리
- 사용자 인증, RBAC(전체 권한 세트가 있는 admin/user 역할), API 키 관리, 속도 제한
- 팀 관리 - admin 전용 CRUD. 사용자는 프로필의 `team` 필드를 통해 팀에 할당됩니다
- 런타임 설정 - 재배포 없이 `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` 및 기타 운영 노브를 제어하는 `settings` 테이블의 키-값 저장소
- 데이터베이스 기반 설정을 통한 사용자 지정 브랜딩 및 런타임 환경설정
- `/api/docs`의 Scalar/OpenAPI 문서
- 프로덕션에서 빌드된 프런트엔드를 SPA로 서빙

주요 의존성: Fastify, Drizzle ORM(pg-core, node-postgres), Sharp, BullMQ, ioredis, 검증을 위한 Zod.

서버는 SIGTERM/SIGINT에서 정상 종료를 처리합니다. HTTP 연결을 드레인하고, BullMQ 워커를 중지하며, Python 디스패처를 종료하고, 데이터베이스 연결을 닫습니다.

### Web (`apps/web`) {#web-apps-web}

Vite로 빌드된 React 19 단일 페이지 앱입니다. 상태 관리에 Zustand, 스타일링에 Tailwind CSS v4, 아이콘에 Lucide를 사용합니다. REST와 SSE(진행률 추적용)를 통해 API와 통신합니다.

페이지에는 도구 워크스페이스, 영구 업로드 및 결과를 관리하는 Files 페이지, 자동화/파이프라인 빌더, 관리자 설정 패널이 포함됩니다.

빌드된 프런트엔드는 프로덕션에서 Fastify 백엔드가 서빙하므로 Docker 컨테이너에 별도의 웹 서버가 없습니다.

### Docs (`apps/docs`) {#docs-apps-docs}

이 VitePress 사이트입니다. `main`로 푸시하면 Cloudflare Pages에 자동으로 배포됩니다.

## 요청이 흐르는 방식 {#how-a-request-flows}

1. 사용자가 웹 UI에서 도구를 선택하고 파일을 업로드합니다.
2. 프런트엔드는 파일과 설정을 담아 `/api/v1/tools/:section/:toolId`에 멀티파트 POST를 보냅니다.
3. API 경로는 Zod로 입력을 검증한 다음 처리를 디스패치합니다.
4. 표준 도구의 경우 작업이 적절한 BullMQ 풀(모달리티에 따라 image, media 또는 docs)로 큐에 추가됩니다. 인프로세스 BullMQ 워커는 EXIF 메타데이터를 기반으로 이미지 방향을 자동 조정하고, 도구의 처리 함수를 실행한 다음 결과를 반환합니다.
5. AI 도구의 경우 TypeScript 브리지가 영구 Python 디스패처에 요청을 보내고(또는 폴백으로 새 서브프로세스를 생성), 완료를 기다린 다음 출력 파일을 읽습니다.
6. 작업 진행률은 PostgreSQL의 `jobs` 테이블에 유지되므로 상태가 컨테이너 재시작에도 살아남습니다. 실시간 업데이트는 `/api/v1/jobs/:jobId/progress`의 SSE를 통해 전달됩니다.
7. API는 `jobId`와 `downloadUrl`을 반환합니다. 사용자는 `/api/v1/download/:jobId/:filename`에서 처리된 파일을 다운로드합니다.

파이프라인의 경우 API는 각 단계의 출력을 다음 단계의 입력으로 공급하여 순차적으로 실행합니다.

배치 처리의 경우 API는 단계별 자식 작업이 있는 BullMQ 플로우를 사용하고 처리된 모든 파일이 담긴 ZIP 파일을 반환합니다.

## 리소스 사용량 {#resource-footprint}

SnapOtter는 낮은 유휴 메모리 사용량을 위해 설계되었습니다. 시작 시 사전 로드되거나 워밍업 상태로 유지되는 것은 없습니다.

### 유휴 상태 {#at-idle}

Node.js/Fastify 프로세스, PostgreSQL, Redis가 실행됩니다. 일반적인 유휴 RAM은 세 컨테이너(Node.js 프로세스, Postgres, Redis) 전체에서 **약 200-300 MB**입니다. Python 프로세스도, 메모리 내 모델 가중치도 없습니다.

### 무엇이 언제 시작되는가 {#what-starts-and-when}

| 구성 요소 | 시작 시점 | 활성 중 메모리 |
|-----------|-------------|---------------------|
| Fastify 서버 + Postgres + Redis | 컨테이너 시작 | 총 약 200-300 MB |
| BullMQ 워커 | 컨테이너 시작(인프로세스) | 풀당 하나의 워커(image, media, ai, docs, system) |
| Python 디스패처 | 첫 AI 도구 요청 | Python 인터프리터 + 사전 임포트된 라이브러리(PIL, NumPy, MediaPipe, rembg) - 모델 가중치 없음 |
| AI 모델 가중치 | 특정 도구의 요청 중 | 디스크에서 로드되어 요청이 끝나면 해제됨 |

### 모델 로딩 {#model-loading}

모든 모델 가중치 파일(총 수 GB)은 항상 `/opt/models/`의 디스크에 있습니다. 각 AI 도구 스크립트는 요청 기간 동안 자신의 모델만 메모리에 로드한 다음 이를 해제합니다. 일부 스크립트는 메모리가 즉시 반환되도록 추론 후 명시적으로 `del model`와 `torch.cuda.empty_cache()`를 호출합니다.

요청 간 모델 캐시는 없습니다. 동일한 AI 도구를 연속으로 실행하면 매번 모델을 다시 로드합니다. 이는 모든 AI 요청에서 모델 로드 지연이라는 대가를 치르는 대신 유휴 메모리를 거의 0에 가깝게 유지합니다.

### 첫 AI 요청 콜드 스타트 {#first-ai-request-cold-start}

컨테이너가 시작될 때 Python 디스패처는 실행되지 않습니다. 첫 AI 요청은 두 가지를 병렬로 트리거합니다. 디스패처가 백그라운드에서 워밍업을 시작하고, 요청 자체는 일회성 Python 서브프로세스 생성으로 폴백합니다. 디스패처가 준비 신호를 보내면 이후 모든 AI 요청은 이를 직접 사용하고 서브프로세스 생성 비용을 건너뜁니다.
