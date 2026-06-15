// Teste do leitor de relatório OF (.rpt) com os arquivos reais em parts/.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";
import { isOfReport, parseOfReport } from "@/lib/import/of-report";

function loadWb(rel: string) {
  const buffer = readFileSync(resolve(process.cwd(), rel));
  return XLSX.read(buffer, { type: "buffer" });
}

describe("Importação do relatório OF", () => {
  const lote1 = loadWb("parts/lote 1 medida de chapa.xls");
  const lote2 = loadWb("parts/lote 2 medida de chapa.xls");

  it("reconhece os dois arquivos como relatório OF [FR-001]", () => {
    expect(isOfReport(lote1)).toBe(true);
    expect(isOfReport(lote2)).toBe(true);
  });

  it("não reconhece um workbook qualquer como relatório OF", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["largura", "altura"]]), "Planilha1");
    expect(isOfReport(wb)).toBe(false);
  });

  it("extrai lote 1: 49 peças, soma qtd 238, primeiro e último pedido corretos [SC-001/SC-003]", () => {
    const { items, imported, skipped } = parseOfReport(lote1);
    expect(imported).toBe(49);
    expect(items).toHaveLength(49);
    expect(skipped).toBe(0);
    expect(items.reduce((s, p) => s + p.qty, 0)).toBe(238);
    expect(items[0].label).toBe("01966/26");
    expect(items[items.length - 1].label).toBe("01965/26");
  });

  it("extrai lote 2: 13 peças, soma qtd 35 [SC-001]", () => {
    const { items, imported } = parseOfReport(lote2);
    expect(imported).toBe(13);
    expect(items.reduce((s, p) => s + p.qty, 0)).toBe(35);
    expect(items[0].label).toBe("01645/26");
    expect(items[items.length - 1].label).toBe("01745/26");
  });

  it("não trunca em linhas em branco intermediárias [SC-002]", () => {
    // lote 1 tem linhas em branco entre as linhas 9 e 12; o último pedido
    // (linha 59) só aparece se as lacunas forem puladas em vez de encerrarem a leitura.
    const { items } = parseOfReport(lote1);
    expect(items.some((p) => p.label === "01965/26")).toBe(true);
  });

  it("mapeia altura (O), largura (R) e quantidade (M) por posição fixa [FR-004]", () => {
    const { items } = parseOfReport(lote1);
    // Primeira linha de dados (L9): pedido 01966/26, qtd 2, altura 1003, largura 1113
    expect(items[0]).toMatchObject({ label: "01966/26", qty: 2, h: 1003, w: 1113 });
  });
});
