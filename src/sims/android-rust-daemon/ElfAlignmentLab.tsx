import { useState } from "react";
import { LabStage, MetricPill, Segmented } from "../../kit";

type ExecPath = "appdata" | "nativeLib";
type KernelPage = "4k" | "16k";
type ElfAlign = "4k" | "16k" | "64k";
type LinkMode = "dynamic" | "static";

const PAGE_KB: Record<KernelPage, number> = { "4k": 4, "16k": 16 };
const ALIGN_KB: Record<ElfAlign, number> = { "4k": 4, "16k": 16, "64k": 64 };

export function ElfAlignmentLab() {
  const [execPath, setExecPath] = useState<ExecPath>("nativeLib");
  const [kernelPage, setKernelPage] = useState<KernelPage>("16k");
  const [elfAlign, setElfAlign] = useState<ElfAlign>("64k");
  const [linkMode, setLinkMode] = useState<LinkMode>("static");

  const kKb = PAGE_KB[kernelPage];
  const aKb = ALIGN_KB[elfAlign];

  // Segment layout in KB: .text (R-X) ends at 28 KB; .data (RW-) starts at next multiple of aKb.
  const textEndKb = 28;
  const dataStartKb = Math.ceil(textEndKb / aKb) * aKb;
  const dataEndKb = dataStartKb + 18;
  const totalKb = Math.max(80, Math.ceil((dataEndKb + 8) / 16) * 16);

  // Page conflict occurs when textEndKb and dataStartKb share the same kernel page!
  const textLastPage = Math.floor((textEndKb - 1) / kKb);
  const dataFirstPage = Math.floor(dataStartKb / kKb);
  const pageConflict = textLastPage === dataFirstPage || aKb < kKb;

  const wxBlocked = execPath === "appdata";
  const interpMissing = linkMode === "dynamic";
  const ok = !wxBlocked && !interpMissing && !pageConflict;

  const verdict = wxBlocked
    ? { label: "EACCES (W^X noexec)", tone: "rose" as const, detail: "On Android targetSdk >= 29, SELinux blocks execve() from writable app data directories. Package the binary as libomppulse.so inside nativeLibraryDir instead." }
    : interpMissing
      ? { label: "ENOENT (PT_INTERP)", tone: "amber" as const, detail: "A dynamically linked Alpine binary asks the kernel for /lib/ld-musl-aarch64.so.1, which does not exist on the Android host. Compile with -C target-feature=+crt-static -C relocation-model=static." }
      : pageConflict
        ? { label: "SIGBUS (Page Overlap)", tone: "rose" as const, detail: `On a ${kKb} KB kernel, .text (R-X) ends at ${textEndKb} KB and .data (RW-) begins at ${dataStartKb} KB—both land inside kernel page #${dataFirstPage} (${dataFirstPage * kKb}–${(dataFirstPage + 1) * kKb} KB). Android 15 refuses to map conflicting RX+RW permissions on one page.` }
        : { label: "execve() OK", tone: "emerald" as const, detail: `AArch64 static ET_EXEC mapped cleanly from nativeLibraryDir with ${aKb} KB PT_LOAD alignment. R-X (.text) and RW- (.data) sit on disjoint ${kKb} KB kernel pages.` };

  const pageCount = Math.ceil(totalKb / kKb);
  const scaleX = (kb: number) => 28 + (kb / totalKb) * 724;

  const checks = [
    { label: "Location", val: execPath === "nativeLib" ? "lib/arm64/libomppulse.so" : "files/omp-pulse (app data)", pass: !wxBlocked },
    { label: "e_type", val: linkMode === "static" ? "ET_EXEC (non-PIE static)" : "ET_DYN + PT_INTERP", pass: !interpMissing },
    { label: "p_align", val: `0x${(aKb * 1024).toString(16)} (${aKb} KB)`, pass: !pageConflict },
    { label: "Android 15", val: aKb >= 16 ? "16 KB page safe" : "Fails >= 16 KB check", pass: !pageConflict },
  ];

  return (
    <LabStage
      kicker="Lab 01 · ELF & W^X"
      title="Android 15 Page Alignment & W^X Exec Gate"
      metrics={
        <>
          <MetricPill label="Kernel" value={`${kKb} KB`} tone="cyan" />
          <MetricPill label="p_align" value={`${aKb} KB`} tone={pageConflict ? "rose" : "accent"} />
          <MetricPill label="Verdict" value={verdict.label} tone={verdict.tone} />
        </>
      }
      controls={
        <>
          <Segmented
            label="Binary location"
            value={execPath}
            onChange={setExecPath}
            options={[
              { value: "appdata", label: "App Data (files/)" },
              { value: "nativeLib", label: "nativeLibraryDir (lib*.so)" },
            ]}
          />
          <Segmented
            label="Kernel page size"
            value={kernelPage}
            onChange={setKernelPage}
            options={[
              { value: "4k", label: "4 KB (Android 7–14)" },
              { value: "16k", label: "16 KB (Android 15+)" },
            ]}
          />
          <Segmented
            label="ELF PT_LOAD p_align"
            value={elfAlign}
            onChange={setElfAlign}
            options={[
              { value: "4k", label: "p_align 4 KB" },
              { value: "16k", label: "p_align 16 KB" },
              { value: "64k", label: "p_align 64 KB" },
            ]}
          />
          <Segmented
            label="Linking"
            value={linkMode}
            onChange={setLinkMode}
            options={[
              { value: "dynamic", label: "Dynamic (PT_INTERP)" },
              { value: "static", label: "Static (+crt-static)" },
            ]}
          />
        </>
      }
      caption={
        <>
          <strong>{verdict.label}:</strong> {verdict.detail}
        </>
      }
    >
      {/* Top check strip matching build-runtime.sh's real ELF verifier */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
          gap: "0.55rem",
          marginBottom: "1rem",
        }}
      >
        {checks.map((c) => (
          <div
            key={c.label}
            style={{
              padding: "0.55rem 0.72rem",
              borderRadius: "8px",
              border: `1px solid ${c.pass ? "var(--emerald-border)" : "var(--rose-border)"}`,
              background: c.pass ? "var(--emerald-bg)" : "var(--rose-bg)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.73rem",
            }}
          >
            <div style={{ color: "var(--fg-muted)", fontSize: "0.66rem", marginBottom: "0.18rem" }}>
              {c.pass ? "PASS" : "FAIL"} · {c.label}
            </div>
            <div style={{ color: "var(--fg)", fontWeight: 600, wordBreak: "break-word" }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Interactive Virtual Address Space & Kernel Page Grid SVG */}
      <svg
        viewBox="0 0 780 205"
        role="img"
        aria-label="ELF PT_LOAD segment alignment against Android kernel page boundaries"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Kernel Page Grid Columns */}
        {Array.from({ length: pageCount }, (_, i) => {
          const x1 = scaleX(i * kKb);
          const x2 = scaleX(Math.min(totalKb, (i + 1) * kKb));
          const isConflictPage = pageConflict && i === dataFirstPage;
          return (
            <g key={i}>
              <rect
                x={x1}
                y={34}
                width={Math.max(1, x2 - x1)}
                height={128}
                fill={isConflictPage ? "var(--rose-bg)" : i % 2 === 0 ? "rgba(148,163,184,0.035)" : "transparent"}
                stroke={isConflictPage ? "var(--rose)" : "var(--border-subtle)"}
                strokeWidth={isConflictPage ? 1.5 : 1}
                strokeDasharray={isConflictPage ? "4 3" : undefined}
              />
              {kKb === 16 || i % 4 === 0 ? (
                <text
                  x={x1 + 3}
                  y={24}
                  fill="var(--fg-faint)"
                  fontFamily="var(--font-mono)"
                  fontSize="10"
                >
                  {`0x${(i * kKb * 1024).toString(16)}`}
                </text>
              ) : null}
              {kKb === 16 ? (
                <text
                  x={(x1 + x2) / 2}
                  y={178}
                  textAnchor="middle"
                  fill={isConflictPage ? "var(--rose)" : "var(--fg-faint)"}
                  fontFamily="var(--font-mono)"
                  fontSize="10"
                  fontWeight={isConflictPage ? "700" : "400"}
                >
                  {isConflictPage ? `Page ${i} CONFLICT` : `Page ${i} (${kKb}K)`}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* PT_LOAD 0: .text (R-X) */}
        <rect
          x={scaleX(0)}
          y={54}
          width={scaleX(textEndKb) - scaleX(0)}
          height={42}
          rx={7}
          fill={wxBlocked ? "var(--rose-bg)" : "var(--accent-bg)"}
          stroke={wxBlocked ? "var(--rose)" : "var(--accent)"}
          strokeWidth={1.6}
          style={{ transition: "all 240ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
        <text
          x={scaleX(0) + 10}
          y={73}
          fill="var(--fg)"
          fontFamily="var(--font-mono)"
          fontSize="11.5"
          fontWeight="600"
        >
          PT_LOAD[0] .text (R-X)
        </text>
        <text
          x={scaleX(0) + 10}
          y={88}
          fill="var(--fg-muted)"
          fontFamily="var(--font-mono)"
          fontSize="10"
        >
          0 KB → {textEndKb} KB {wxBlocked ? "· NOEXEC!" : ""}
        </text>

        {/* Alignment padding gap */}
        {dataStartKb > textEndKb ? (
          <g>
            <line
              x1={scaleX(textEndKb) + 2}
              y1={120}
              x2={scaleX(dataStartKb) - 2}
              y2={120}
              stroke="var(--fg-faint)"
              strokeDasharray="3 3"
            />
            <text
              x={(scaleX(textEndKb) + scaleX(dataStartKb)) / 2}
              y={114}
              textAnchor="middle"
              fill="var(--fg-muted)"
              fontFamily="var(--font-mono)"
              fontSize="9.5"
            >
              pad {dataStartKb - textEndKb}K
            </text>
          </g>
        ) : null}

        {/* PT_LOAD 1: .data / .bss (RW-) */}
        <rect
          x={scaleX(dataStartKb)}
          y={104}
          width={scaleX(dataEndKb) - scaleX(dataStartKb)}
          height={42}
          rx={7}
          fill={pageConflict ? "var(--rose-bg)" : "var(--emerald-bg)"}
          stroke={pageConflict ? "var(--rose)" : "var(--emerald)"}
          strokeWidth={1.6}
          style={{ transition: "all 240ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
        <text
          x={scaleX(dataStartKb) + 10}
          y={123}
          fill="var(--fg)"
          fontFamily="var(--font-mono)"
          fontSize="11.5"
          fontWeight="600"
        >
          PT_LOAD[1] .data (RW-)
        </text>
        <text
          x={scaleX(dataStartKb) + 10}
          y={138}
          fill="var(--fg-muted)"
          fontFamily="var(--font-mono)"
          fontSize="10"
        >
          {dataStartKb} KB → {dataEndKb} KB
        </text>

        {/* Bottom status line */}
        <text
          x={28}
          y={198}
          fill={ok ? "var(--emerald)" : "var(--rose)"}
          fontFamily="var(--font-mono)"
          fontSize="11"
          fontWeight="600"
        >
          {ok
            ? "✓ Kernel maps R-X and RW- onto separate pages · proot binds nativeLibraryDir → /opt/pulse/libomppulse.so"
            : `✕ Loader rejected binary: ${verdict.label}`}
        </text>
      </svg>
    </LabStage>
  );
}
