// Offline speech in and out: ffmpeg (any audio -> 16 kHz WAV), whisper.cpp (speech-to-text),
// Piper (text-to-speech). Binaries come from tools/setup.ps1; override paths with env vars.
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";

const TOOLS = process.env.INHABIT_TOOLS || path.join(__dirname, "..", "..", "tools");
const WHISPER = process.env.WHISPER_BIN || path.join(TOOLS, "bin", "whisper", "Release", "whisper-cli.exe");
const WHISPER_MODEL = process.env.WHISPER_MODEL || path.join(TOOLS, "models", "ggml-base.en.bin");
const PIPER = process.env.PIPER_BIN || path.join(TOOLS, "bin", "piper", "piper", "piper.exe");
const PIPER_VOICE = process.env.PIPER_VOICE || path.join(TOOLS, "models", "en_US-lessac-medium.onnx");
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";

// Biases Whisper toward our vocabulary, so "commode" isn't heard as "commo".
const VOCAB_HINT =
  "Inhabit. Tap, commode, washbasin, shower head, wall tiles, lighting, grey, beige, warm, daylight, " +
  "deck tap, wall-mount tap, oval, round, combo, chrome, brass, bronze, matte black, biscuit, dune.";

function run(cmd: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-300)}`))));
    if (stdin !== undefined) p.stdin.end(stdin);
  });
}

function tmp(ext: string) {
  return path.join(os.tmpdir(), `inhabit-${randomUUID()}.${ext}`);
}

export const sttAvailable = () => fs.existsSync(WHISPER) && fs.existsSync(WHISPER_MODEL);
export const ttsAvailable = () => fs.existsSync(PIPER) && fs.existsSync(PIPER_VOICE);

export async function transcribe(audio: Buffer): Promise<string> {
  const input = tmp("bin");
  const wav = tmp("wav");
  try {
    fs.writeFileSync(input, audio);
    await run(FFMPEG, ["-y", "-loglevel", "error", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
    const text = await run(WHISPER, ["-m", WHISPER_MODEL, "-f", wav, "-nt", "-np", "-l", "en", "--prompt", VOCAB_HINT]);
    // Whisper marks silence/noise as "[BLANK_AUDIO]" or "(music)"; treat as nothing heard.
    return text.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  } finally {
    fs.rmSync(input, { force: true });
    fs.rmSync(wav, { force: true });
  }
}

export async function speak(text: string): Promise<Buffer> {
  const wav = tmp("wav");
  try {
    await run(PIPER, ["--model", PIPER_VOICE, "--output_file", wav], text);
    return fs.readFileSync(wav);
  } finally {
    fs.rmSync(wav, { force: true });
  }
}
