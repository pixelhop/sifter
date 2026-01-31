#!/usr/bin/env python3
"""
Whisper Transcription Script
Local Whisper wrapper for Sifter podcast transcription

Usage:
    python whisper-transcribe.py <audio_file> [--model MODEL] [--language LANG] [--output FORMAT]

Requirements:
    pip install openai-whisper

Example:
    python whisper-transcribe.py episode.mp3 --model base --output json
"""

import argparse
import json
import sys
import warnings

# Suppress FP16 warning on CPU
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU")

def transcribe_audio(audio_path: str, model_name: str = "base", language: str = None) -> dict:
    """
    Transcribe audio file using Whisper

    Args:
        audio_path: Path to the audio file
        model_name: Whisper model size (tiny, base, small, medium, large, large-v2, large-v3)
        language: Optional language code (auto-detect if not specified)

    Returns:
        Dictionary with transcription results
    """
    import whisper

    # Load the model
    print(f"Loading Whisper model: {model_name}", file=sys.stderr)
    model = whisper.load_model(model_name)

    # Transcribe
    print(f"Transcribing: {audio_path}", file=sys.stderr)

    options = {
        "verbose": False,
        "task": "transcribe",
    }

    if language:
        options["language"] = language

    result = model.transcribe(audio_path, **options)

    # Format output
    segments = []
    for segment in result.get("segments", []):
        segments.append({
            "start": round(segment["start"], 2),
            "end": round(segment["end"], 2),
            "text": segment["text"].strip()
        })

    # Calculate total duration from last segment
    duration = segments[-1]["end"] if segments else 0

    return {
        "text": result["text"].strip(),
        "language": result.get("language", "en"),
        "duration": duration,
        "segments": segments
    }


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using Whisper")
    parser.add_argument("audio_path", help="Path to the audio file")
    parser.add_argument(
        "--model",
        default="base",
        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"],
        help="Whisper model size (default: base)"
    )
    parser.add_argument(
        "--language",
        default=None,
        help="Language code (e.g., 'en' for English). Auto-detect if not specified."
    )
    parser.add_argument(
        "--output",
        default="json",
        choices=["json", "text"],
        help="Output format (default: json)"
    )

    args = parser.parse_args()

    try:
        result = transcribe_audio(
            args.audio_path,
            model_name=args.model,
            language=args.language
        )

        if args.output == "json":
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(result["text"])

    except FileNotFoundError:
        print(f"Error: Audio file not found: {args.audio_path}", file=sys.stderr)
        sys.exit(1)
    except ImportError:
        print("Error: Whisper not installed. Run: pip install openai-whisper", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error during transcription: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
