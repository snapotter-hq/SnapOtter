---
description: "품질 제어와 함께 비디오 파일 크기를 줄입니다."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: b4ab30e97d8a
---

# Compress Video {#compress-video}

구성 가능한 압축 강도와 선택적 해상도 다운스케일링을 사용하여 비디오 파일 크기를 줄입니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다. 이 엔드포인트는 비동기입니다. 즉시 `202 Accepted`를 반환하고 진행 상황은 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 스트리밍됩니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | 압축 강도: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | 출력 해상도: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `light` 프리셋은 원본에 가까운 품질을 유지합니다. `strong` 프리셋은 시각적 충실도를 희생하면서 파일 크기를 적극적으로 줄입니다.
- 해상도 다운스케일링(예: 4K에서 720p로)은 압축과 결합되어 크기를 크게 줄입니다.
- 작업이 완료될 때까지 진행 상황 업데이트는 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 제공됩니다.
