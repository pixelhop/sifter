/**
 * Local Whisper Provider
 * Uses Python subprocess to run Whisper locally
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import type {
  WhisperProvider,
  WhisperProviderOptions,
  TranscriptionResult,
  TranscriptSegment,
} from "./types";

interface LocalWhisperConfig {
  model?: string; // Model size: tiny, base, small, medium, large
  pythonPath?: string; // Custom Python executable path
}

interface WhisperPythonOutput {
  text: string;
  language: string;
  duration: number;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export class LocalWhisperProvider implements WhisperProvider {
  readonly name = "local";
  private model: string;
  private pythonPath: string;

  constructor(config?: LocalWhisperConfig) {
    this.model = config?.model || "base";
    this.pythonPath = config?.pythonPath || "python3";
  }

  async transcribe(
    audioPath: string,
    options?: WhisperProviderOptions
  ): Promise<TranscriptionResult> {
    const scriptPath = path.join(
      __dirname,
      "..",
      "..",
      "scripts",
      "whisper-transcribe.py"
    );

    const model = options?.model || this.model;

    return new Promise((resolve, reject) => {
      const args = [scriptPath, audioPath, "--model", model, "--output", "json"];

      if (options?.language) {
        args.push("--language", options.language);
      }

      const process = spawn(this.pythonPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Whisper process exited with code ${code}: ${stderr || stdout}`
            )
          );
          return;
        }

        try {
          // Extract JSON from output (may have logs before it)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("No JSON output found from Whisper");
          }

          const data: WhisperPythonOutput = JSON.parse(jsonMatch[0]);

          const segments: TranscriptSegment[] = data.segments.map((seg) => ({
            start: seg.start,
            end: seg.end,
            text: seg.text.trim(),
          }));

          resolve({
            text: data.text,
            segments,
            language: data.language,
            duration: data.duration,
          });
        } catch (parseError) {
          reject(
            new Error(
              `Failed to parse Whisper output: ${parseError}. Raw output: ${stdout}`
            )
          );
        }
      });

      process.on("error", (error) => {
        reject(new Error(`Failed to spawn Whisper process: ${error.message}`));
      });
    });
  }
}
