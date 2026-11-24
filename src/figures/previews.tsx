import { OmpPulsePreview } from "./omp-pulse-memory/Preview";

/** Registry mapping frontmatter `preview` keys to miniature homepage canvases. */
export function PostPreview({ id }: { id: string }) {
  switch (id) {
    case "omp-pulse-memory":
      return <OmpPulsePreview />;
    default:
      return null;
  }
}
