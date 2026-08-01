"use client";

import { createContext, useContext } from "react";

export type WorkspaceSection = "full" | "calendar" | "records";

export const WorkspaceSectionContext = createContext<WorkspaceSection>("full");

export function useWorkspaceSection() {
  return useContext(WorkspaceSectionContext);
}

export type PanelContextValue = {
  openPanel: (key: string) => void;
};

export const PanelContext = createContext<PanelContextValue>({
  openPanel: () => {},
});

export function usePanel() {
  return useContext(PanelContext);
}
