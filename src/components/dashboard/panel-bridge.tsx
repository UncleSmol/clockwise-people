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
  desktopOnly?: boolean;
};

type PanelBridgeValue = {
  navItems: PanelNavItem[];
  activePanelKey: string | null;
  openPanel: (key: string) => void;
  closePanel: () => void;
  registerPanelOpener: (open: (key: string) => void) => void;
  registerPanelCloser: (close: () => void) => void;
  registerActivePanelKey: (key: string | null) => void;
  registerNavItems: (items: PanelNavItem[]) => void;
};

const PanelBridgeContext = createContext<PanelBridgeValue>({
  navItems: [],
  activePanelKey: null,
  openPanel: () => {},
  closePanel: () => {},
  registerPanelOpener: () => {},
  registerPanelCloser: () => {},
  registerActivePanelKey: () => {},
  registerNavItems: () => {},
});

export function usePanelBridge() {
  return useContext(PanelBridgeContext);
}

export function PanelBridgeProvider({ children }: { children: ReactNode }) {
  const [navItems, setNavItems] = useState<PanelNavItem[]>([]);
  const [activePanelKey, setActivePanelKey] = useState<string | null>(null);
  const [opener, setOpener] = useState<(key: string) => void>(() => () => {});
  const [closer, setCloser] = useState<() => void>(() => () => {});

  const openPanel = useCallback(
    (key: string) => {
      setActivePanelKey(key);
      opener(key);
    },
    [opener],
  );

  const closePanel = useCallback(() => {
    setActivePanelKey(null);
    closer();
  }, [closer]);

  const registerPanelOpener = useCallback(
    (open: (key: string) => void) => setOpener(() => open),
    [],
  );

  const registerPanelCloser = useCallback(
    (close: () => void) => setCloser(() => close),
    [],
  );

  const registerActivePanelKey = useCallback((key: string | null) => {
    setActivePanelKey(key);
  }, []);

  const registerNavItems = useCallback((items: PanelNavItem[]) => {
    setNavItems((current) =>
      current.length === items.length &&
      current.every(
        (item, index) =>
          item.key === items[index]?.key &&
          item.label === items[index]?.label &&
          item.desktopOnly === items[index]?.desktopOnly,
      )
        ? current
        : items,
    );
  }, []);

  return (
    <PanelBridgeContext.Provider
      value={{
        navItems,
        activePanelKey,
        openPanel,
        closePanel,
        registerPanelOpener,
        registerPanelCloser,
        registerActivePanelKey,
        registerNavItems,
      }}
    >
      {children}
    </PanelBridgeContext.Provider>
  );
}