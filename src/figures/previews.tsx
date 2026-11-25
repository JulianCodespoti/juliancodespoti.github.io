import { GpsPreview } from "./how-gps-solves-clock-drift/Preview";
import { ContextWindowPreview } from "./inside-a-coding-agents-context-window/Preview";
import { OmpPulsePreview } from "./omp-pulse-memory/Preview";
import { MultiAgentPreview } from "./single-agent-vs-multi-agent-swarms/Preview";
import { FloatPreview } from "./why-floating-point-breaks/Preview";

/** Registry mapping frontmatter `preview` keys to miniature homepage canvases. */
export function PostPreview({ id }: { id: string }) {
  switch (id) {
    case "omp-pulse-memory":
      return <OmpPulsePreview />;
    case "inside-a-coding-agents-context-window":
      return <ContextWindowPreview />;
    case "single-agent-vs-multi-agent-swarms":
      return <MultiAgentPreview />;
    case "why-floating-point-breaks":
      return <FloatPreview />;
    case "how-gps-solves-clock-drift":
      return <GpsPreview />;
    default:
      return null;
  }
}
