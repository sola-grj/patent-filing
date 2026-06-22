"use client";

import { createContext, useContext, useState } from "react";

type RequestWizardController = {
  isDirty: boolean;
  resetToStart: () => void;
  saveDraftAndReset: () => Promise<boolean>;
};

type RequestWizardControllerContextValue = {
  controller: RequestWizardController | null;
  registerController: (controller: RequestWizardController | null) => void;
};

const RequestWizardControllerContext = createContext<RequestWizardControllerContextValue | null>(null);

export function RequestWizardControllerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [controller, setController] = useState<RequestWizardController | null>(null);

  return (
    <RequestWizardControllerContext.Provider
      value={{ controller, registerController: setController }}
    >
      {children}
    </RequestWizardControllerContext.Provider>
  );
}

export function useRequestWizardController() {
  const context = useContext(RequestWizardControllerContext);
  if (!context) {
    throw new Error("useRequestWizardController must be used within RequestWizardControllerProvider.");
  }
  return context;
}
