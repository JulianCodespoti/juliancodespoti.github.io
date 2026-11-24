import type { ReactNode } from "react";

export function ToyStage({ framed = true, children }: { framed?: boolean; children: ReactNode }) {
  return <div className={framed ? "toy-stage toy-stage--framed" : "toy-stage"}>{children}</div>;
}
