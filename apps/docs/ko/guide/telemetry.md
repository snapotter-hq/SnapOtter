---
description: "SnapOtter가 수집하는 익명 사용 데이터, 전송 시점, 인스턴스 전체 제품 분석을 끄는 방법."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 98f38443c2fd
---

# SnapOtter가 수집하는 것 {#what-snapotter-collects}

익명 제품 분석은 기본적으로 켜져 있으며 관리자가 인스턴스 전체에 대해 설정합니다. Settings > System > Privacy에서 끌 수 있습니다.

## 전송하는 이벤트(활성화된 경우) {#events-we-send-when-enabled}

- tool_used: 도구 id, 상태, 소요 시간, 카테고리, AI 도구 여부, 실패 시 오류 코드.
- pipeline_executed: 단계 수, 도구 id, 배치 플래그, 파일 수, 소요 시간, 상태.
- ai_bundle_action: 번들 id, 작업, 소요 시간.
- 프런트엔드 사용: 어떤 도구 페이지가 열리는지, 추가된 파일(개수만), 도구 시작, 다운로드, 저장, 검색(결과 수만), 배치 처리.
- 크래시 리포트: 오류 유형과 파일 기본 이름만 포함된 소스 스택.

## 절대 수집하지 않는 것 {#what-we-never-collect}

- 파일 이름 또는 경로
- 파일 내용
- OCR 출력 텍스트
- 이미지 메타데이터(EXIF)
- 추출된 문서 텍스트
- 여러분의 IP 주소 또는 계정 신원

## 끄는 방법 {#turning-it-off}

관리자: Settings > System > Privacy에서 "Anonymous Product Analytics"를 끕니다. 즉시, 인스턴스 전체에서 중단됩니다. 절대로 방출할 수 없는 이미지를 빌드하려면 `SNAPOTTER_ANALYTICS=off` 빌드 인수를 설정하세요.
