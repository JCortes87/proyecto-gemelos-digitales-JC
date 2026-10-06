// @vitest-environment jsdom
// Tests de la protección contra inyección de fórmulas (CSV injection) en
// utils/export.js: toda celda de texto que empiece por =, +, -, @, tab o CR
// debe salir con una comilla simple delante.
import { describe, it, expect, vi, afterEach } from "vitest";
import { escCsv, neutralizeCsvFormula, downloadCsv, exportStudentsCsv } from "./export";

describe("neutralizeCsvFormula", () => {
  it("antepone ' a textos que empiezan por caracteres de fórmula", () => {
    expect(neutralizeCsvFormula("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(neutralizeCsvFormula("+1+1")).toBe("'+1+1");
    expect(neutralizeCsvFormula("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(neutralizeCsvFormula("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(neutralizeCsvFormula("\t=1")).toBe("'\t=1");
    expect(neutralizeCsvFormula("\r=1")).toBe("'\r=1");
  });

  it("no altera textos normales ni números", () => {
    expect(neutralizeCsvFormula("Juan Pérez")).toBe("Juan Pérez");
    expect(neutralizeCsvFormula("a=b")).toBe("a=b");
    expect(neutralizeCsvFormula(-5)).toBe(-5);
    expect(neutralizeCsvFormula(3.5)).toBe(3.5);
    expect(neutralizeCsvFormula(null)).toBe(null);
  });

  it("no rompe números negativos legítimos en texto", () => {
    expect(neutralizeCsvFormula("-3.5")).toBe("-3.5");
    expect(neutralizeCsvFormula("-12%")).toBe("-12%");
    expect(neutralizeCsvFormula("-4,2")).toBe("-4,2");
  });
});

describe("escCsv", () => {
  it("neutraliza y luego aplica el quoting CSV", () => {
    expect(escCsv("=1+2")).toBe("'=1+2");
    expect(escCsv("=A1,B1")).toBe("\"'=A1,B1\"");
    expect(escCsv("@x \"y\"")).toBe("\"'@x \"\"y\"\"\"");
  });

  it("mantiene el comportamiento para valores normales", () => {
    expect(escCsv(null)).toBe("");
    expect(escCsv(undefined)).toBe("");
    expect(escCsv("Pérez, Ana")).toBe("\"Pérez, Ana\"");
    expect(escCsv(-7)).toBe("-7");
    expect(escCsv(42)).toBe("42");
  });
});

const BOM_RE = new RegExp("^\uFEFF");

describe("descargas CSV usan el escapado protegido", () => {
  let captured = [];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    captured = [];
  });

  function mockDownload() {
    const OrigBlob = globalThis.Blob;
    vi.stubGlobal("Blob", class extends OrigBlob {
      constructor(parts, opts) {
        super(parts, opts);
        captured.push(parts.join(""));
      }
    });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  }

  it("downloadCsv neutraliza encabezados y celdas", () => {
    mockDownload();
    downloadCsv("x.csv", ["Nombre", "Nota"], [["=cmd()", -3], ["Ana", "-2.5"]]);
    expect(captured).toHaveLength(1);
    const lines = captured[0].replace(BOM_RE, "").split("\r\n");
    expect(lines[0]).toBe("Nombre,Nota");
    expect(lines[1]).toBe("'=cmd(),-3");
    expect(lines[2]).toBe("Ana,-2.5");
  });

  it("exportStudentsCsv neutraliza nombres maliciosos de Brightspace", () => {
    mockDownload();
    exportStudentsCsv(
      [{ userId: 1, displayName: "@evil", email: "+x@y.com", risk: "alto" }],
      { Name: "Curso" },
      { columns: ["userId", "displayName", "email", "risk"] },
    );
    const lines = captured[0].replace(BOM_RE, "").split("\r\n");
    expect(lines[1]).toBe("1,'@evil,'+x@y.com,alto");
  });
});
