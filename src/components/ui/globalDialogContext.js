import { createContext, useContext } from "react";

const fallbackDialog = {
  alert: async (message) => {
    globalThis.alert?.(message);
  },
  confirm: async (message) => globalThis.confirm?.(message) ?? false,
  prompt: async (message, options = {}) => (
    globalThis.prompt?.(message, options.defaultValue ?? "") ?? null
  ),
};

export const GlobalDialogContext = createContext(fallbackDialog);

export function useGlobalDialog() {
  return useContext(GlobalDialogContext);
}
