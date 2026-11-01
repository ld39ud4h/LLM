import { env } from "../../config/env.js";

export type ToolResult = { handled: true; name: string; response: string } | { handled: false };

type LocalTool = {
  name: string;
  description: string;
  match: (input: string) => boolean;
  run: (input: string) => string;
};

const ptDate = (date: Date, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: env.BOT_TIMEZONE, ...options }).format(date);

function calculate(expression: string): number {
  const tokens = expression.replace(/,/g, ".").match(/\d+(?:\.\d+)?|[()+\-*/%^]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "").replace(/,/g, ".")) {
    throw new Error("Expressão inválida");
  }
  let i = 0;
  const primary = (): number => {
    const token = tokens[i++];
    if (token === undefined) throw new Error("Expressão incompleta");
    if (token === "+") return primary();
    if (token === "-") return -primary();
    if (token === "(") {
      const value = sum();
      if (tokens[i++] !== ")") throw new Error("Parêntese não fechado");
      return value;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Número inválido");
    return value;
  };
  const power = (): number => {
    let value = primary();
    if (tokens[i] === "^") { i++; value = value ** power(); }
    return value;
  };
  const product = (): number => {
    let value = power();
    while (["*", "/", "%"].includes(tokens[i] ?? "")) {
      const op = tokens[i++];
      const rhs = power();
      if (op === "*") value *= rhs;
      else if (op === "/") value /= rhs;
      else value %= rhs;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      const rhs = product();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  };
  const result = sum();
  if (i !== tokens.length || !Number.isFinite(result)) throw new Error("Não foi possível calcular");
  return result;
}

const units: Record<string, { family: string; factor: number; label: string }> = {
  mm: { family: "length", factor: 0.001, label: "milímetros" },
  cm: { family: "length", factor: 0.01, label: "centímetros" },
  m: { family: "length", factor: 1, label: "metros" },
  km: { family: "length", factor: 1000, label: "quilômetros" },
  in: { family: "length", factor: 0.0254, label: "polegadas" },
  ft: { family: "length", factor: 0.3048, label: "pés" },
  mg: { family: "mass", factor: 0.001, label: "miligramas" },
  g: { family: "mass", factor: 1, label: "gramas" },
  kg: { family: "mass", factor: 1000, label: "quilogramas" },
  t: { family: "mass", factor: 1000000, label: "toneladas" },
  ml: { family: "volume", factor: 0.001, label: "mililitros" },
  l: { family: "volume", factor: 1, label: "litros" },
  m3: { family: "volume", factor: 1000, label: "metros cúbicos" },
  s: { family: "time", factor: 1, label: "segundos" },
  min: { family: "time", factor: 60, label: "minutos" },
  h: { family: "time", factor: 3600, label: "horas" },
  d: { family: "time", factor: 86400, label: "dias" },
  mps: { family: "speed", factor: 1, label: "metros por segundo" },
  kmh: { family: "speed", factor: 1 / 3.6, label: "quilômetros por hora" },
  b: { family: "data", factor: 1, label: "bytes" },
  kb: { family: "data", factor: 1000, label: "quilobytes" },
  mb: { family: "data", factor: 1000000, label: "megabytes" },
  gb: { family: "data", factor: 1000000000, label: "gigabytes" },
  tib: { family: "data", factor: 1099511627776, label: "tebibytes" },
};

function convert(input: string): string | null {
  const match = input.match(/(-?\d+(?:[.,]\d+)?)\s*(mm|cm|km|m3|m|in|ft|mg|kg|g|t|ml|l|min|mps|km\/h|kmh|h|s|d|tib|gb|mb|kb|b)\s+(?:para|em|to)\s+(mm|cm|km|m3|m|in|ft|mg|kg|g|t|ml|l|min|mps|km\/h|kmh|h|s|d|tib|gb|mb|kb|b)\b/i);
  if (!match) return null;
  const from = match[2]!.toLowerCase();
  const to = match[3]!.toLowerCase().replace("km/h", "kmh");
  const a = units[from];
  const b = units[to];
  if (!a || !b || a.family !== b.family) return "Essas unidades não pertencem à mesma categoria de conversão.";
  const value = Number(match[1]!.replace(",", "."));
  const result = value * a.factor / b.factor;
  return `${value} ${a.label} equivalem a ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(result)} ${b.label}.`;
}

const tools: LocalTool[] = [
  {
    name: "fuso_horario",
    description: "Horário atual em fusos horários e cidades conhecidas",
    match: (s) => /\b(que horas|horário|hora atual)\b.*\b(em|no|na)\b/.test(s),
    run: (s) => {
      const zones: Record<string, string> = { lisboa: "Europe/Lisbon", londres: "Europe/London", "nova york": "America/New_York", "los angeles": "America/Los_Angeles", tóquio: "Asia/Tokyo", tokyo: "Asia/Tokyo", "são paulo": "America/Sao_Paulo", brasília: "America/Sao_Paulo", "brasília": "America/Sao_Paulo", "buenos aires": "America/Argentina/Buenos_Aires", "paris": "Europe/Paris", "dubai": "Asia/Dubai" };
      const city = Object.keys(zones).find((name) => s.includes(name));
      if (!city) return "Informe uma cidade conhecida. Exemplo: que horas são em Lisboa?";
      const zone = zones[city];
      return `Agora em ${city.replace(/\b\w/g, (v) => v.toUpperCase())}: ${new Intl.DateTimeFormat("pt-BR", { timeZone: zone, dateStyle: "full", timeStyle: "medium" }).format(new Date())} (${zone}).`;
    },
  },
  {
    name: "data_hora",
    description: "Data, hora, dia da semana e fuso horário local",
    match: (s) => /\b(que dia|qual (?:é )?a data|data de hoje|que horas|hora atual|horário atual|data e hora|dia da semana|hoje é que dia)\b/.test(s),
    run: () => {
      const now = new Date();
      return `Agora são ${ptDate(now, { hour: "2-digit", minute: "2-digit", second: "2-digit" })} de ${ptDate(now, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}. Fuso horário: ${env.BOT_TIMEZONE}.`;
    },
  },
  {
    name: "conversao_unidades",
    description: "Conversão de comprimento, massa, volume, tempo, velocidade e armazenamento",
    match: (s) => /\b(para|em|to)\b/.test(s) && /\b(mm|cm|km|m3|metros?|polegadas?|kg|gramas?|mg|litros?|ml|segundos?|minutos?|horas?|km\/h|m\/s|gb|mb|kb|bytes?)\b/.test(s),
    run: (s) => convert(s) ?? "Não identifiquei as unidades. Exemplo: 108 km/h para m/s.",
  },
  {
    name: "calculadora",
    description: "Operações aritméticas, parênteses, potências e resto",
    match: (s) => /^(?:quanto é|calcule|calcular|resolva)?\s*[-+]?\d[\d\s.,()+*/%^]*\??$/.test(s.trim()),
    run: (s) => {
      const expression = s.replace(/^(quanto é|calcule|calcular|resolva)\s*/i, "").replace(/\?$/, "").trim();
      const result = calculate(expression);
      return `Resultado: ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 10 }).format(result)}.`;
    },
  },
  {
    name: "porcentagem",
    description: "Percentual de um valor e acréscimos/descontos",
    match: (s) => /\b(quanto é|calcule|calcular)\b.*%/.test(s),
    run: (s) => {
      const nums = s.match(/-?\d+(?:[.,]\d+)?/g)?.map((v) => Number(v.replace(",", "."))) ?? [];
      if (nums.length < 2) return "Informe o percentual e o valor. Exemplo: quanto é 15% de 200?";
      const pct = nums[0]!, base = nums[1]!, value = base * pct / 100;
      return `${pct}% de ${base} = ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(value)}.`;
    },
  },
  {
    name: "conversao_temperatura",
    description: "Conversão entre Celsius, Fahrenheit e Kelvin",
    match: (s) => /\b(-?\d+(?:[.,]\d+)?)\s*°?\s*(celsius|fahrenheit|kelvin|°c|°f|°k)\s+(?:para|em)\s*(celsius|fahrenheit|kelvin|°c|°f|°k)\b/.test(s),
    run: (s) => {
      const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*°?\s*(celsius|fahrenheit|kelvin|°c|°f|°k)\s+(?:para|em)\s*(celsius|fahrenheit|kelvin|°c|°f|°k)/);
      if (!m) return "Exemplo: 25 Celsius para Fahrenheit.";
      const n = Number(m[1].replace(",", "."));
      const unit = (v: string) => v.includes("c") ? "C" : v.includes("f") ? "F" : "K";
      const from = unit(m[2]), to = unit(m[3]);
      const celsius = from === "C" ? n : from === "F" ? (n - 32) * 5 / 9 : n - 273.15;
      const result = to === "C" ? celsius : to === "F" ? celsius * 9 / 5 + 32 : celsius + 273.15;
      return `${n}°${from} = ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(result)}°${to}.`;
    },
  },
  {
    name: "diferenca_datas",
    description: "Calcula dias entre duas datas no formato DD/MM/AAAA",
    match: (s) => /\b(dias entre|diferença entre datas|quantos dias)\b/.test(s),
    run: (s) => {
      const dates = [...s.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)];
      if (dates.length < 2) return "Informe duas datas no formato DD/MM/AAAA.";
      const toUtc = (m: RegExpMatchArray) => Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      const days = Math.abs(toUtc(dates[1]!) - toUtc(dates[0]!)) / 86400000;
      return `A diferença entre as datas é de ${days} dia(s).`;
    },
  },
  {
    name: "timestamp",
    description: "Conversão de timestamp Unix para data",
    match: (s) => /\b(timestamp|unix)\b/.test(s),
    run: (s) => {
      const raw = s.match(/\b\d{10,13}\b/)?.[0];
      if (!raw) return "Envie o timestamp Unix (10 dígitos em segundos ou 13 em milissegundos).";
      const n = Number(raw);
      const date = new Date(raw.length === 10 ? n * 1000 : n);
      if (Number.isNaN(date.getTime())) return "Timestamp inválido.";
      return `${raw} corresponde a ${ptDate(date, { dateStyle: "full", timeStyle: "long" })} (${env.BOT_TIMEZONE}).`;
    },
  },
];

export function runLocalTool(prompt: string): ToolResult {
  const normalized = prompt.toLocaleLowerCase("pt-BR").trim();
  for (const tool of tools) {
    if (!tool.match(normalized)) continue;
    try {
      return { handled: true, name: tool.name, response: tool.run(normalized) };
    } catch {
      return { handled: true, name: tool.name, response: "Não consegui interpretar essa operação. Confira os valores e tente novamente." };
    }
  }
  return { handled: false };
}

export function listLocalTools(): Array<Pick<LocalTool, "name" | "description">> {
  return tools.map(({ name, description }) => ({ name, description }));
}
