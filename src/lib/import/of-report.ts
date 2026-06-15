// Leitor do relatório OF (export "of_geral_parcial.rpt").
//
// Layout de posição fixa (não usa cabeçalho, que vem desalinhado):
//   - dados começam na linha 9
//   - coluna B = pedido (rótulo)   coluna M = quantidade
//   - coluna O = altura            coluna R = largura (mm)
//   - fim dos dados = última linha com valor na coluna B
//   - linhas com B vazio entre dados são ignoradas (não truncam a leitura)
//
// Função pura e agnóstica de UI (Constituição, Artigo II): recebe um WorkBook
// do SheetJS e devolve PieceItem[] + um resumo da importação.

import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";
import type { PieceItem } from "@/lib/cnc-engine";

export interface OfReportResult {
  items: PieceItem[];
  /** linhas de dado válidas importadas */
  imported: number;
  /** linhas com pedido mas dados incompletos (qtd/dimensão), ignoradas */
  skipped: number;
}

const SHEET_NAME_RE = /of_geral_parcial/i;
const FIRST_DATA_ROW = 9;

/** Verdadeiro quando o arquivo é reconhecível como relatório OF. */
export function isOfReport(wb: WorkBook): boolean {
  return (wb.SheetNames ?? []).some((name) => SHEET_NAME_RE.test(name));
}

function cell(ws: WorkSheet, col: string, row: number): unknown {
  const c = ws[`${col}${row}`];
  return c ? c.v : undefined;
}

function asNumber(v: unknown): number {
  return Number(v) || 0;
}

function asLabel(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

/** Extrai as peças de um relatório OF por posição fixa de coluna. */
export function parseOfReport(wb: WorkBook): OfReportResult {
  const sheetName = (wb.SheetNames ?? []).find((n) => SHEET_NAME_RE.test(n)) ?? wb.SheetNames?.[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws || !ws["!ref"]) return { items: [], imported: 0, skipped: 0 };

  const range = utils.decode_range(ws["!ref"]);
  const lastRow = range.e.r + 1; // !ref é 0-based; linhas A1 são 1-based

  const items: PieceItem[] = [];
  let skipped = 0;

  for (let row = FIRST_DATA_ROW; row <= lastRow; row++) {
    const pedido = asLabel(cell(ws, "B", row));
    if (pedido === "") continue; // linha em branco / sem pedido: ignora

    const qty = asNumber(cell(ws, "M", row));
    const h = asNumber(cell(ws, "O", row)); // altura
    const w = asNumber(cell(ws, "R", row)); // largura

    if (qty <= 0 || w <= 0 || h <= 0) {
      skipped++; // linha com pedido mas dados incompletos
      continue;
    }

    items.push({
      id: `of_${row}_${items.length}`,
      qty,
      w,
      h,
      label: pedido,
    });
  }

  return { items, imported: items.length, skipped };
}
