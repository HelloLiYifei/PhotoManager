import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const snakeToCamel = (key) => key.replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());

export function camelizeKeys(value) {
  if (Array.isArray(value)) {
    return value.map(camelizeKeys);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      snakeToCamel(key),
      camelizeKeys(nestedValue),
    ]),
  );
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export class TauriServiceError extends Error {
  constructor(command, cause) {
    super(errorMessage(cause));
    this.name = "TauriServiceError";
    this.command = command;
    this.cause = cause;
  }

  toString() {
    return this.message;
  }
}

export async function invokeCommand(command, args) {
  try {
    const result = await invoke(command, args);
    return camelizeKeys(result);
  } catch (error) {
    throw new TauriServiceError(command, error);
  }
}

export async function listenToEvent(eventName, handler) {
  try {
    return await listen(eventName, (event) => {
      handler({
        ...event,
        payload: camelizeKeys(event.payload),
      });
    });
  } catch (error) {
    throw new TauriServiceError(`listen:${eventName}`, error);
  }
}
