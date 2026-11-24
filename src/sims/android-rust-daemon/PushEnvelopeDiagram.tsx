import { useMemo, useState } from "react";
import { Diagram, ModeSwitch } from "../../kit";

function fakeHex(text: string): string {
  const bytes: string[] = [];
  let h = 2166136261;
  for (let i = 0; i < 12; i++) {
    h ^= (text.charCodeAt(i % Math.max(1, text.length)) || 65) + i * 17;
    h = Math.imul(h, 16777619) >>> 0;
    bytes.push(((h >>> 16) & 0xff).toString(16).padStart(2, "0"));
  }
  return bytes.join(" ");
}

export function PushEnvelopeDiagram() {
  const [text, setText] = useState("Reply ready: 9 tests pass");
  const [view, setView] = useState<"relay" | "phone">("relay");

  const hex = useMemo(() => fakeHex(text || "Reply ready"), [text]);

  return (
    <Diagram
      top={
        <>
          <span>RFC 8291 aes128gcm body</span>
          <ModeSwitch
            label="Viewer perspective"
            value={view}
            onChange={setView}
            options={[
              { value: "relay", label: "Push server sees" },
              { value: "phone", label: "Your phone sees" },
            ]}
          />
        </>
      }
      footer={
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", width: "100%" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--fg-muted)" }}>
            message
          </span>
          <input
            type="text"
            value={text}
            maxLength={60}
            onChange={(e) => setText(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "0.35rem 0.6rem",
              borderRadius: "6px",
              border: "1px solid var(--line)",
              background: "var(--bg)",
              color: "var(--fg)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
            }}
          />
        </label>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "82px 92px minmax(0, 1fr) 74px", gap: "6px" }}>
        <div
          style={{
            padding: "0.6rem 0.55rem",
            borderRadius: "6px",
            background: "var(--well-alt)",
            border: "1px solid var(--line)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ fontSize: "0.66rem", color: "var(--fg-dim)" }}>16 B</div>
          <div style={{ fontSize: "0.76rem", color: "var(--fg-muted)", marginTop: "2px" }}>salt</div>
        </div>

        <div
          style={{
            padding: "0.6rem 0.55rem",
            borderRadius: "6px",
            background: "var(--blue-soft)",
            border: "1px solid var(--blue)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ fontSize: "0.66rem", color: "var(--blue)" }}>65 B</div>
          <div style={{ fontSize: "0.76rem", color: "var(--fg)", marginTop: "2px" }}>P-256 key</div>
        </div>

        <div
          style={{
            padding: "0.6rem 0.7rem",
            borderRadius: "6px",
            background: view === "phone" ? "var(--green-soft)" : "var(--amber-soft)",
            border: `1px solid ${view === "phone" ? "var(--green)" : "var(--amber)"}`,
            fontFamily: "var(--font-mono)",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: "0.66rem", color: view === "phone" ? "var(--green)" : "var(--amber)" }}>
            {view === "phone" ? "decrypted on phone" : "encrypted payload"}
          </div>
          <div
            style={{
              fontSize: "0.76rem",
              color: "var(--fg)",
              marginTop: "2px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {view === "phone" ? text || "(empty)" : hex}
          </div>
        </div>

        <div
          style={{
            padding: "0.6rem 0.55rem",
            borderRadius: "6px",
            background: "var(--well-alt)",
            border: "1px solid var(--line)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ fontSize: "0.66rem", color: "var(--fg-dim)" }}>16 B</div>
          <div style={{ fontSize: "0.76rem", color: "var(--fg-muted)", marginTop: "2px" }}>GCM tag</div>
        </div>
      </div>
    </Diagram>
  );
}
