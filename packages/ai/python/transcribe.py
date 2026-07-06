"""Speech-to-text transcription using faster-whisper (CTranslate2)."""
import sys
import json
import os

from gpu import ctranslate2_gpu_available


MODELS_PATH = os.environ.get(
    "MODELS_PATH",
    os.path.join(os.environ.get("DATA_DIR", "/data"), "ai", "models"),
)


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def main():
    input_path = sys.argv[1]
    settings = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    language = settings.get("language", "auto")
    # "task" is accepted for forward-compat but only "transcribe" is used today
    _task = settings.get("task", "transcribe")

    try:
        emit_progress(5, "Loading model")

        # Lazy import -- faster_whisper is only available when the
        # transcription bundle is installed; keeping it lazy lets
        # py_compile succeed without the dependency.
        from faster_whisper import WhisperModel

        model_dir = os.path.join(MODELS_PATH, "faster-whisper-small")

        # When the bundled model dir is absent, faster-whisper treats the
        # argument as a Hugging Face repo id and downloads it; strict offline
        # mode blocks that fallback with a clear error.
        from offline_guard import downloads_allowed, ensure_download_allowed
        if not os.path.isdir(model_dir):
            ensure_download_allowed("Whisper transcription model (faster-whisper-small)")

        if ctranslate2_gpu_available():
            device, compute_type = "cuda", "float16"
        else:
            device, compute_type = "cpu", "int8"

        model = WhisperModel(
            model_dir,
            device=device,
            compute_type=compute_type,
            local_files_only=not downloads_allowed(),
        )

        emit_progress(20, "Transcribing")

        lang_arg = None if language == "auto" else language
        segments_iter, info = model.transcribe(
            input_path,
            language=lang_arg,
            vad_filter=True,
        )

        detected_language = info.language if info else (language if language != "auto" else "en")

        segments = []
        batch_count = 0
        for seg in segments_iter:
            segments.append({
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
            })
            batch_count += 1
            if batch_count % 5 == 0:
                emit_progress(min(20 + batch_count, 90), "Transcribing")

        emit_progress(95, "Done")

        full_text = " ".join(s["text"] for s in segments)

        print(json.dumps({
            "success": True,
            "language": detected_language,
            "segments": segments,
            "text": full_text,
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
