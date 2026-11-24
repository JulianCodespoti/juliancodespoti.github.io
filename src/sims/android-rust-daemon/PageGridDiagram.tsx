import { useState } from "react";
import { Diagram, ModeSwitch, TimelineSlider } from "../../kit";

const ALIGNS = [
  { kb: 4, dataStart: 6, label: "4 KB alignment (breaks Android 15)" },
  { kb: 16, dataStart: 8, label: "16 KB alignment (clean page split)" },
  { kb: 64, dataStart: 12, label: "64 KB alignment (safe on 4K, 16K, 64K)" },
] as const;

export function PageGridDiagram() {
  const [step, setStep] = useState(0);
  const [kernel, setKernel] = useState<"16k" | "4k">("16k");

  const cfg = ALIGNS[step];
  const codeCount = 6; // squares 0..5 (24 KB)
  const dataStart = cfg.dataStart; // square index (each square = 4 KB)
  const dataCount = 4; // 4 squares (16 KB)

  // On a 16 KB kernel, pages are groups of 4 squares: [0..3], [4..7], [8..11], [12..15]
  const conflict = kernel === "16k" && Math.floor((codeCount - 1) / 4) === Math.floor(dataStart / 4);

  return (
    <Diagram
      top={
        <>
          <span style={{ color: conflict ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
            {conflict ? "Page 1 conflict: code and data share one 16 KB page" : cfg.label}
          </span>
          <ModeSwitch
            label="Kernel page size"
            value={kernel}
            onChange={setKernel}
            options={[
              { value: "4k", label: "4 KB kernel" },
              { value: "16k", label: "16 KB kernel" },
            ]}
          />
        </>
      }
      footer={<TimelineSlider step={step} maxStep={2} onChange={setStep} label="Segment alignment" />}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "0.55rem",
        }}
      >
        {[0, 1, 2, 3].map((pageIdx) => {
          const isBadPage = conflict && pageIdx === 1;
          return (
            <div
              key={pageIdx}
              style={{
                padding: "0.45rem",
                borderRadius: "7px",
                border:
                  kernel === "16k"
                    ? `1.5px solid ${isBadPage ? "var(--red)" : "var(--line-strong)"}`
                    : "1px dashed var(--line)",
                background: isBadPage ? "var(--red-soft)" : "transparent",
                transition: "border-color 180ms ease, background 180ms ease",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.68rem",
                  color: isBadPage ? "var(--red)" : "var(--fg-dim)",
                  marginBottom: "0.4rem",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{kernel === "16k" ? `Page ${pageIdx}` : `${pageIdx * 16}K`}</span>
                {isBadPage ? <span>FAIL</span> : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                {[0, 1, 2, 3].map((slot) => {
                  const idx = pageIdx * 4 + slot;
                  const isCode = idx < codeCount;
                  const isData = idx >= dataStart && idx < dataStart + dataCount;
                  const bg = isCode
                    ? "var(--amber)"
                    : isData
                      ? isBadPage
                        ? "var(--red)"
                        : "var(--blue)"
                      : "var(--well-alt)";
                  const border = isCode || isData ? "transparent" : "var(--line)";
                  return (
                    <div
                      key={idx}
                      title={`${idx * 4} KB: ${isCode ? "code (R-X)" : isData ? "data (RW-)" : "empty"}`}
                      style={{
                        aspectRatio: "1",
                        borderRadius: "4px",
                        background: bg,
                        border: `1px solid ${border}`,
                        transition: "background 180ms ease",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Diagram>
  );
}
