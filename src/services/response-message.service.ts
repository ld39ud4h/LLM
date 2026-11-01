import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { registerAnswerForRemember } from "./response-memory.service.js";

type ContentBlock =
  | { kind: "text"; content: string }
  | { kind: "separator" };

function isSimpleAnswer(text: string): boolean {
  const trimmed = text.trim();
  const structured = /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\|)/m.test(trimmed)
    || /\n\s*```/.test(trimmed)
    || /\n\s*\n/.test(trimmed)
    || /^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/m.test(trimmed);
  return trimmed.length <= 260 && !structured;
}

function splitAnswer(text: string, limit: number): string[] {
  const result: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.55) cut = remaining.lastIndexOf(" ", limit);
    if (cut < limit * 0.55) cut = limit;
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

function splitTableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

/**
 * Converts Markdown block syntax into Discord-native visual building blocks.
 * Inline Markdown (bold, italic, links, code) is intentionally kept intact
 * because Discord TextDisplay supports it.
 */
function parseMarkdownBlocks(markdown: string): ContentBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ContentBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const content = paragraph.join("\n").trim();
    if (content) {
      for (const part of splitAnswer(content, 3500)) blocks.push({ kind: "text", content: part });
    }
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";

    // A Markdown table is recognized by its header + delimiter row.
    if (line.includes("|") && next.includes("|") && isTableSeparator(next)) {
      flushParagraph();
      const headers = splitTableCells(line);
      i += 2; // Skip both the header and Markdown delimiter row.

      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        const rowLine = lines[i] ?? "";
        if (rowLine.trim()) rows.push(splitTableCells(rowLine));
        i++;
      }
      i--;

      // A compact header, followed by readable row cards. Discord has no
      // native table component, so each row is rendered as labeled text.
      if (headers.length) {
        blocks.push({ kind: "text", content: headers.map((header) => `**${header}**`).join("  ·  ") });
      }
      for (const row of rows) {
        const cells = headers.map((header, index) => ({
          header,
          value: row[index] ?? "",
        })).filter((cell) => cell.value.length > 0);

        if (cells.length === 2) {
          blocks.push({
            kind: "text",
            content: `**${cells[0]!.value}**\n${cells[1]!.value}`,
          });
        } else {
          blocks.push({
            kind: "text",
            content: cells.map((cell) => `**${cell.header}:** ${cell.value}`).join("\n"),
          });
        }
        blocks.push({ kind: "separator" });
      }
      // Remove the trailing divider after the final table row.
      if (blocks.at(-1)?.kind === "separator") blocks.pop();
      continue;
    }

    // Horizontal rules become actual Discord Components V2 separators.
    if (/^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: "separator" });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.length ? blocks : [{ kind: "text", content: "Não consegui gerar uma resposta." }];
}

function paginateBlocks(blocks: ContentBlock[]): ContentBlock[][] {
  const pages: ContentBlock[][] = [];
  let page: ContentBlock[] = [];
  let textLength = 0;
  let componentCount = 0;

  for (const block of blocks) {
    const blockComponents = block.kind === "separator" ? 1 : 1;
    const blockLength = block.kind === "text" ? block.content.length : 0;
    if (page.length && (componentCount + blockComponents > 32 || textLength + blockLength > 3500)) {
      pages.push(page);
      page = [];
      textLength = 0;
      componentCount = 0;
    }
    page.push(block);
    textLength += blockLength;
    componentCount += blockComponents;
  }
  if (page.length) pages.push(page);
  return pages;
}

export function buildAnswerMessages(answer: string, userId: string) {
  const normalized = answer || "Não consegui gerar uma resposta.";
  if (isSimpleAnswer(normalized)) {
    const token = registerAnswerForRemember(userId, normalized.trim());
    const button = new ButtonBuilder()
      .setCustomId("answer:remember:" + userId + ":" + token)
      .setLabel("Lembrar")
      .setEmoji("🧠")
      .setStyle(ButtonStyle.Secondary);
    return [{
      content: normalized.trim(),
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      allowedMentions: { parse: [] as const },
    }];
  }

  const pages = paginateBlocks(parseMarkdownBlocks(normalized));
  return pages.map((blocks, index) => {
    const rememberedText = blocks
      .filter((block): block is Extract<ContentBlock, { kind: "text" }> => block.kind === "text")
      .map((block) => block.content)
      .join("\n");
    const token = registerAnswerForRemember(userId, rememberedText);
    const button = new ButtonBuilder()
      .setCustomId("answer:remember:" + userId + ":" + token)
      .setLabel("Lembrar")
      .setEmoji("🧠")
      .setStyle(ButtonStyle.Secondary);

    const container = new ContainerBuilder().setAccentColor(0x5865f2);
    for (const block of blocks) {
      if (block.kind === "separator") {
        container.addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
      }
    }
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("-# Consultor · Resposta" + " " + (index + 1) + "/" + pages.length),
      )
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button));

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2 as const,
      allowedMentions: { parse: [] as const },
    };
  });
}
