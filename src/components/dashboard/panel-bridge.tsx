"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type PanelNavItem = {
  key: string;
  label: string;
};

type PanelBridgeValue = {
  navItems: PanelNavItem[];
  openPanel: (key: string) => void;
  registerPanelOpener: (open: (key: string) => void) => void;
  registerNavItems: (items: PanelNavItem[]) => void;
};

const PanelBridgeContext = createContext<PanelBridgeValue>({
  navItems: [],
  openPanel: () => {},
  registerPanelOpener: () => {},
  registerNavItems: () => {},
});

export function usePanelBridge() {
  return useContext(PanelBridgeContext);
}

export function PanelBridgeProvider({ children }: { children: ReactNode }) {
  const [navItems, setNavItems] = useState<PanelNavItem[]>([]);
  const [opener, setOpener] = useState<(key: string) => void>(() => () => {});

  const openPanel = useCallback(
    (key: string) => opener(key),
    [opener],
  );

  const registerPanelOpener = useCallback(
    (open: (key: string) => void) => setOpener(() => open),
    [],
  );

  const registerNavItems = useCallback((items: PanelNavItem[]) => {
    setNavItems((current) =>
      current.length === items.length &&
      current.every((item, index) => item.key === items[index]?.key && item.label === items[index]?.label)
        ? current
        : items,
    );
  }, []);

  return (
    <PanelBridgeContext.Provider
      value={{
        navItems,
        openPanel,
        registerPanelOpener,
        registerNavItems,
      }}
    >
      {children}
    </PanelBridgeContext.Provider>
  );
}