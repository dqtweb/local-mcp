import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { resolveWithin } from "./workspace.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fontRatio = (n: number) => Math.max(0.16, 0.45 - 0.05 * (n - 1));

type Hsl = { h: number; s: number; l: number };

/** seed set → deterministic per (seed, text); omitted → random every call. */
function background(seed: string | undefined, text: string): Hsl {
  if (seed === undefined) {
    return { h: Math.random(), s: 0.55 + Math.random() * 0.3, l: 0.35 + Math.random() * 0.25 };
  }
  const d = createHash("sha256").update(`${seed}:${text}`).digest();
  return { h: d[0] / 255, s: 0.55 + (d[1] / 255) * 0.3, l: 0.35 + (d[2] / 255) * 0.25 };
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
}

function parseHex(color: string): [number, number, number] {
  if (!HEX_COLOR.test(color)) throw new Error(`Invalid color ${color}; expected hex like '#4f46e5'.`);
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toHex = (rgb: [number, number, number]) =>
  "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

function luminance(rgb: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function buildSvg(text: string, bg: string, fg: string, size: number): string {
  const fontPx = Math.round(size * fontRatio(text.length));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(text)}">` +
    `<rect width="100%" height="100%" rx="${Math.round(size * 0.14)}" fill="${bg}"/>` +
    `<text x="50%" y="54%" fill="${fg}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-weight="700" ` +
    `font-size="${fontPx}" letter-spacing="${(size * 0.01).toFixed(1)}">${esc(text)}</text></svg>`
  );
}

async function renderPng(text: string, bg: string, fg: string, size: number): Promise<Buffer> {
  let mod: typeof import("@napi-rs/canvas");
  try {
    mod = await import("@napi-rs/canvas");
  } catch {
    throw new Error("PNG output requires @napi-rs/canvas — install with: npm i @napi-rs/canvas");
  }
  const canvas = mod.createCanvas(size, size);
  const g = canvas.getContext("2d");
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, size, size, Math.round(size * 0.14));
  g.fill();
  g.fillStyle = fg;
  g.font = `bold ${Math.round(size * fontRatio(text.length))}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, size / 2, size * 0.54);
  return canvas.encode("png");
}

export const avatarTools = {
  register(server: McpServer, ctx: AppContext): void {
    server.registerResource(
      "avatar-tool-info",
      "avatar://tool-info",
      {
        title: "Avatar tool documentation",
        description: "Usage and output details for the avatar_generate MCP tool.",
        mimeType: "text/markdown",
      },
      async () => ({
        contents: [
          {
            uri: "avatar://tool-info",
            mimeType: "text/markdown",
            text: [
              "# Avatar generator",
              "",
              "Use `avatar_generate` to create a square profile avatar from initials or a short name.",
              "",
              "- `text`: required, 1–24 characters",
              "- `size`: optional integer from 64 to 1024; defaults to 256",
              "- `format`: `png` or `svg`; defaults to `png` for inline chat previews",
              "- `color`: optional six-digit background color such as `#4f46e5`",
              "- `seed`: optional value for deterministic colors",
              "- `save_to_workspace`: optionally saves an SVG copy under `avatars/`",
              "",
              "The tool returns MCP image content so compatible clients can preview it inline.",
            ].join("\n"),
          },
        ],
      }),
    );

    server.registerPrompt(
      "avatar-create",
      {
        title: "Create an avatar",
        description: "Guide the agent to create an inline-previewable avatar.",
        argsSchema: {
          text: z.string().optional().describe("Initials or short name"),
          style: z.string().optional().describe("Optional color or style preference"),
        },
      },
      async ({ text, style }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create an avatar using the avatar_generate tool.${text ? ` Use the text '${text}'.` : " Ask for initials if needed."}${style ? ` Apply this preference: ${style}.` : ""} Prefer PNG format so I can preview the image inline.`,
            },
          },
        ],
      }),
    );

    server.registerTool(
      "avatar_generate",
      {
        title: "Avatar generator",
        description:
          "Generate a square avatar: text centered on a colored background. " +
          "Use for user/profile avatars, placeholders, or identicons. " +
          "Prefer PNG for raster use (chat display, downloads); SVG for scalable UI. " +
          "Pass seed for stable per-user colors (same text+seed = same avatar).",
        inputSchema: {
          text: z.string().min(1).max(24).describe("Initials or short name (up to ~8 chars looks best)"),
          size: z.number().int().min(64).max(1024).default(256),
          // PNG is the safest default for inline previews across chat UIs.
          format: z.enum(["svg", "png"]).default("png"),
          color: z.string().regex(HEX_COLOR).optional().describe("Background hex, e.g. '#4f46e5'. Random if omitted"),
          seed: z.string().optional().describe("Deterministic colors for a given text+seed"),
          save_to_workspace: z.boolean().default(false).describe("Also save the SVG to workspace/avatars/"),
        },
      },
      async ({ text, size, seed, color, format, save_to_workspace }) => {
        const clean = text.trim();
        const bgRgb = color ? parseHex(color) : hslToRgb(background(seed, clean));
        const bg = toHex(bgRgb);
        const fg = luminance(bgRgb) > 0.45 ? "#101418" : "#ffffff";
        const svg = buildSvg(clean, bg, fg, size);

        const content: CallToolResult["content"] = [];
        if (format === "png") {
          const png = await renderPng(clean, bg, fg, size);
          content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
        } else {
          // MCP image content lets chat clients render the avatar inline.
          // Keep the SVG as base64 because image content requires encoded data.
          content.push({
            type: "image",
            data: Buffer.from(svg, "utf8").toString("base64"),
            mimeType: "image/svg+xml",
          });
        }
        content.push({
          type: "text",
          text:
            `Avatar "${clean}": bg ${bg}, text ${fg}, ${size}x${size}, format ${format}` +
            (seed ? `, seed "${seed}"` : ", random colors"),
        });

        if (save_to_workspace) {
          const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "avatar";
          const suffix = createHash("sha256").update(`${bg}:${clean}`).digest("hex").slice(0, 8);
          const rel = `avatars/${slug}-${suffix}.svg`;
          const target = resolveWithin(ctx.settings.workspaceDir, rel);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, svg, "utf8");
          content.push({ type: "text", text: `Saved to workspace: ${rel}` });
        }

        return { content };
      },
    );
  },
};
