import { promises as fs } from "fs";
import path from "path";

const VOICE_PATH = path.join(process.cwd(), "voice", "samples.md");

export interface VoiceSample {
  channel: string | null;
  body: string;
}

let _cache: { mtime: number; samples: VoiceSample[] } | null = null;

export async function loadVoiceSamples(): Promise<VoiceSample[]> {
  try {
    const stat = await fs.stat(VOICE_PATH);
    if (_cache && _cache.mtime === stat.mtimeMs) return _cache.samples;
    const text = await fs.readFile(VOICE_PATH, "utf8");
    const samples = parseSamples(text);
    _cache = { mtime: stat.mtimeMs, samples };
    return samples;
  } catch {
    return [];
  }
}

function parseSamples(text: string): VoiceSample[] {
  const out: VoiceSample[] = [];
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let body = m[2].trim();
    let channel: string | null = null;
    const firstLine = body.split("\n", 1)[0];
    const channelMatch = firstLine.match(/^#\s*(email|x_dm|linkedin)\s*$/i);
    if (channelMatch) {
      channel = channelMatch[1].toLowerCase();
      body = body.slice(firstLine.length).trim();
    }
    if (body.length > 20) out.push({ channel, body });
  }
  return out;
}

export async function appendVoiceSample(body: string, note?: string) {
  const block = `\n\n<!-- ${note ?? "edit"} ${new Date().toISOString()} -->\n\`\`\`\n${body.trim()}\n\`\`\`\n`;
  await fs.appendFile(VOICE_PATH, block);
  _cache = null;
}
