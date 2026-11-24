import { motion } from "motion/react";
import { useState } from "react";
import { Choice, Scene, SPRING_SNAPPY } from "../../engine";

type Align = "4k" | "16k" | "64k";
type Kernel = "4k" | "16k";

// 64 KB total tape shown as 4 x 16 KB hardware pages (0..64 KB).
// Code occupies 0..24 KB (37.5%). Data occupies 16 KB (25%).
const DATA_START_KB: Record<Align, number> = {
  "4k": 24,  // lands inside Page 1 (16..32 KB) alongside code -> conflict!
  "16k": 32, // snaps cleanly to Page 2 boundary (32 KB)
  "64k": 48, // pushed out to clean higher boundary (represents 64 KB aligned)
};

export function PageAlignmentScene() {
  const [kernel, setKernel] = useState<Kernel>("16k");
  const [align, setAlign] = useState<Align>("4k");

  const dataStart = DATA_START_KB[align];
  const conflict = kernel === "16k" && dataStart < 32;

  return (
    <Scene
      title={
        <span style={{ color: conflict ? "var(--crimson)" : "var(--sage)", fontWeight: 600 }}>
          {conflict
            ? "Rejected: code (R-X) and data (RW-) share Page 1"
            : kernel === "4k"
              ? "Mapped cleanly on 4 KB kernel"
              : `Mapped cleanly on 16 KB kernel (${align === "64k" ? "64 KB" : "16 KB"} align)`}
        </span>
      }
      controls={
        <>
          <Choice
            label="Segment alignment"
            value={align}
            onChange={setAlign}
            options={[
              { value: "4k", label: "4 KB" },
              { value: "16k", label: "16 KB" },
              { value: "64k", label: "64 KB" },
            ]}
          />
          <Choice
            label="Kernel page size"
            value={kernel}
            onChange={setKernel}
            options={[
              { value: "4k", label: "4K kernel" },
              { value: "16k", label: "16K kernel" },
            ]}
          />
        </>
      }
      footer={
        <>
          <span>code: 0..24 KB (R-X)</span>
          <span>data: {dataStart}..{dataStart + 16} KB (RW-)</span>
        </>
      }
    >
      {/* Hardware page frames underneath */}
      <div style={{ position: "relative", paddingTop: "1.55rem", paddingBottom: "0.35rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
          {[0, 1, 2, 3].map((p) => {
            const bad = conflict && p === 1;
            return (
              <motion.div
                key={p}
                animate={{
                  borderColor: bad
                    ? "var(--crimson)"
                    : kernel === "16k"
                      ? "var(--line-strong)"
                      : "var(--line)",
                  backgroundColor: bad ? "var(--crimson-bg)" : "transparent",
                }}
                transition={SPRING_SNAPPY}
                style={{
                  height: "66px",
                  borderRadius: "7px",
                  borderWidth: kernel === "16k" ? "1.5px" : "1px",
                  borderStyle: kernel === "16k" ? "solid" : "dashed",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "-1.35rem",
                    left: "2px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.68rem",
                    color: bad ? "var(--crimson)" : "var(--fg-dim)",
                  }}
                >
                  {kernel === "16k" ? `Page ${p}${bad ? " · CONFLICT" : ""}` : `${p * 16} KB`}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Floating physical ELF segments gliding smoothly over the page frames */}
        <div
          style={{
            position: "absolute",
            left: "6px",
            right: "6px",
            top: "calc(1.55rem + 12px)",
            height: "42px",
            pointerEvents: "none",
          }}
        >
          {/* Fixed .text (R-X) segment: 0..24 KB = 37.5% */}
          <div
            style={{
              position: "absolute",
              left: "0%",
              width: "36.5%",
              height: "100%",
              borderRadius: "6px",
              border: "1.5px solid var(--copper)",
              background: "var(--copper-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--copper)",
            }}
          >
            .text (R-X)
          </div>

          {/* Gliding .data (RW-) segment */}
          <motion.div
            animate={{
              left: `${(dataStart / 64) * 100}%`,
              borderColor: conflict ? "var(--crimson)" : "var(--teal)",
              backgroundColor: conflict ? "var(--crimson-bg)" : "var(--teal-bg)",
              color: conflict ? "var(--crimson)" : "var(--teal)",
            }}
            transition={SPRING_SNAPPY}
            style={{
              position: "absolute",
              width: "24%",
              height: "100%",
              borderRadius: "6px",
              borderWidth: "1.5px",
              borderStyle: "solid",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            .data (RW-)
          </motion.div>
        </div>
      </div>
    </Scene>
  );
}
