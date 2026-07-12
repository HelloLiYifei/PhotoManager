import { invokeCommand } from "./tauriClient";

export const getActiveWorkspace = () => invokeCommand("get_active_workspace");

export const getWorkspaces = () => invokeCommand("get_workspaces");

export const createWorkspace = (args) => invokeCommand("create_workspace", args);

export const openWorkspace = (args) => invokeCommand("open_workspace", args);

export const deleteWorkspace = (args) => invokeCommand("delete_workspace", args);

export const selectDirectory = () => invokeCommand("select_directory");
