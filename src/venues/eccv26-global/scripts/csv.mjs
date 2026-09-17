import fs from 'node:fs/promises';
import path from 'node:path';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/u, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted field');
  if (field || row.length) { row.push(field.replace(/\r$/u, '')); rows.push(row); }
  const [headers = [], ...data] = rows;
  return data
    .filter((values) => values.some(Boolean))
    .map((values, index) => {
      if (values.length !== headers.length) {
        throw new Error(`Malformed CSV row ${index + 2}: expected ${headers.length} columns, received ${values.length}`);
      }
      return Object.fromEntries(headers.map((header, columnIndex) => [header.replace(/^\uFEFF/u, ''), values[columnIndex] ?? '']));
    });
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function serializeCsv(rows, columns) {
  return `${[columns, ...rows.map((row) => columns.map((column) => row[column] ?? ''))]
    .map((values) => values.map(escapeCsv).join(','))
    .join('\n')}\n`;
}

export async function writeTextAtomically(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, text, 'utf8');
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeCsvAtomically(filePath, rows, columns) {
  await writeTextAtomically(filePath, serializeCsv(rows, columns));
}
