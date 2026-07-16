// Regressão: a caixa de repetições não remonta quando o usuário recalcula, então
// um campo não controlado (defaultValue) mantinha o N antigo e salvava um número
// diferente do que o botão anunciava.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import ReplicationInfoBox from "@/features/command-bar/ReplicationInfoBox";

afterEach(cleanup);

const bom = [{ w: 100, h: 200, need: 1, available: 10 }];
const saveButton = () => screen.getByRole("button", { name: /SALVAR/ });
const input = () => document.getElementById("saveRepCount") as HTMLInputElement;

describe("ReplicationInfoBox", () => {
  it("ressincroniza o campo quando o count é recalculado para cima", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <ReplicationInfoBox info={{ count: 2, bom }} onSave={onSave} onClose={() => {}} />,
    );
    expect(input().value).toBe("2");

    rerender(<ReplicationInfoBox info={{ count: 10, bom }} onSave={onSave} onClose={() => {}} />);

    expect(input().value).toBe("10");
    expect(saveButton()).toHaveTextContent("×10");
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(10);
  });

  it("ressincroniza o campo quando o count é recalculado para baixo", () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <ReplicationInfoBox info={{ count: 8, bom }} onSave={onSave} onClose={() => {}} />,
    );
    rerender(<ReplicationInfoBox info={{ count: 3, bom }} onSave={onSave} onClose={() => {}} />);

    expect(input().value).toBe("3");
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(3);
  });

  it("o rótulo do botão segue o valor digitado, não o máximo", () => {
    const onSave = vi.fn();
    render(<ReplicationInfoBox info={{ count: 10, bom }} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(input(), { target: { value: "4" } });

    expect(saveButton()).toHaveTextContent("×4");
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(4);
  });

  it("satura o valor digitado no máximo e no mínimo", () => {
    const onSave = vi.fn();
    render(<ReplicationInfoBox info={{ count: 5, bom }} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(input(), { target: { value: "99" } });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenLastCalledWith(5);

    fireEvent.change(input(), { target: { value: "0" } });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenLastCalledWith(1);
  });

  it("campo vazio ou inválido salva 1 cópia em vez de NaN", () => {
    const onSave = vi.fn();
    render(<ReplicationInfoBox info={{ count: 5, bom }} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(1);
  });
});
