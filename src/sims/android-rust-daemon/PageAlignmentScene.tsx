import { motion } from "motion/react";
import { useState } from "react";
import { Choice, Scene, SPRING_SNAPPY } from "../../engine";

type Align = "4k" | "16k";
type Device = "4k" | "16k";

// 4 pages shown (0..64 KB). Code takes 1.5 pages (0..24 KB).
// At 4 KB align, Data starts at 24 KB (inside Page 2 alongside Code -> conflict on 16K phones).
// At 16 KB align, Data snaps cleanly to Page 3 (32 KB).
export function PageAlignmentScene() {
  const [align, setAlign] = useState<Align>("4k");
  const [device, setDevice] = useState<Device>("16k");

  const conflict = device === "16k" && align === "4k";
  const dataLeft = align === "4k" ? "37.5%" : "50%";

  return (
    <Scene
      title={
        <span style={{ color: conflict ? "var(--crimson)" : "var(--sage)", fontWeight: 600 }}>
          {conflict
            ? "Conflict: Code and Data share Page 2"
            : device === "4k"
              ? "Allowed on 4 KB phones"
              : "Clean: Separate memory pages"}
        </span>
      }
      controls={
        <>
          <Choice
            label="Alignment"
            value={align}
            onChange={setAlign}
            options={[
              { value: "4k", label: "4 KB align" },
              { value: "16k", label: "16 KB align" },
            ]}
          />
          <Choice
            label="Phone page size"
            value={device}
            onChange={setDevice}
            options={[
              { value: "4k", label: "4K phone" },
              { value: "16k", label: "16K phone" },
            ]}
          />
        </>
      }
    >
      <div style={{ position: "relative", paddingTop: "1.6rem", paddingBottom: "0.25rem" }}>
        {/* Hardware memory pages */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {[1, 2, 3, 4].map((page) => {
            const bad = conflict && page === 2;
            return (
              <motion.div
                key={page}
                animate={{
                  borderColor: bad
                    ? "var(--crimson)"
                    : device === "16k"
                      ? "var(--line-strong)"
                      : "var(--line)",
                  backgroundColor: bad ? "var(--crimson-bg)" : "transparent",
                }}
                transition={SPRING_SNAPPY}
                style={{
                  height: "70px",
                  borderRadius: "8px",
                  borderWidth: device === "16k" ? "1.5px" : "1px",
                  borderStyle: device === "16k" ? "solid" : "dashed",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "-1.4rem",
                    left: "2px",
                    fontSize: "0.75rem",
                    fontWeight: bad ? 600 : 500,
                    color: bad ? "var(--crimson)" : "var(--fg-dim)",
                  }}
                >
                  {device === "16k" ? (bad ? "Page 2 (overlap)" : `Page ${page}`) : `${(page - 1) * 16} KB`}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Gliding Code and Data blocks */}
        <div
          style={{
            position: "absolute",
            left: "8px",
            right: "8px",
            top: "calc(1.6rem + 12px)",
            height: "46px",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "0%",
              width: "36%",
              height: "100%",
              borderRadius: "7px",
              border: "1.5px solid var(--copper)",
              background: "color-mix(in srgb, var(--copper) 16%, var(--stage))",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1.15,
              pointerEvents: "none",
            }}
          >
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--copper)" }}>Code</span>
            <span style={{ fontSize: "0.68rem", color: "var(--fg-muted)" }}>read-only</span>
          </div>

          <motion.button
            type="button"
            onClick={() => setAlign((a) => (a === "4k" ? "16k" : "4k"))}
            title="Click to toggle 4 KB / 16 KB alignment"
            animate={{
              left: dataLeft,
              borderColor: conflict ? "var(--crimson)" : "var(--teal)",
              backgroundColor: conflict
                ? "color-mix(in srgb, var(--crimson) 18%, var(--stage))"
                : "color-mix(in srgb, var(--teal) 16%, var(--stage))",
            }}
            transition={SPRING_SNAPPY}
            style={{
              position: "absolute",
              width: "23.5%",
              height: "100%",
              borderRadius: "7px",
              borderWidth: "1.5px",
              borderStyle: "solid",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1.15,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: conflict ? "var(--crimson)" : "var(--teal)" }}>
              Data
            </span>
            <span style={{ fontSize: "0.68rem", color: "var(--fg-muted)" }}>writable</span>
          </motion.button>
        </div>
      </div>
    </Scene>
  );
}
