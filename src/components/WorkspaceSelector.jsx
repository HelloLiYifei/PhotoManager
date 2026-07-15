import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  FolderOpen,
  HardDrive,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaces,
  openWorkspace,
  selectDirectory,
} from "../services/workspaceService";
import { useI18n } from "../i18n";
import { Button, EmptyState, Field, Spinner, useGlobalDialog } from "./ui";
import { workspaceSelectorStyles as styles } from "../themes/classNames";

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const sortWorkspaces = (workspaces) =>
  [...workspaces].sort((left, right) =>
    String(right.lastOpened ?? "").localeCompare(String(left.lastOpened ?? "")),
  );

function getFolderName(path, fallback) {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) || fallback;
}

export default function WorkspaceSelector({ onSelectWorkspace }) {
  const { confirm: showConfirm } = useGlobalDialog();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const mountedRef = useRef(false);
  const operationRef = useRef(false);
  const listRequestRef = useRef(0);

  const loadWorkspacesList = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    if (mountedRef.current) {
      setListLoading(true);
      setListError("");
    }

    try {
      const list = await getWorkspaces();
      if (mountedRef.current && requestId === listRequestRef.current) {
        setWorkspaces(sortWorkspaces(Array.isArray(list) ? list : []));
      }
    } catch (error) {
      if (mountedRef.current && requestId === listRequestRef.current) {
        setListError(getErrorMessage(error));
      }
    } finally {
      if (mountedRef.current && requestId === listRequestRef.current) {
        setListLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadWorkspacesList();

    return () => {
      mountedRef.current = false;
      operationRef.current = false;
      listRequestRef.current += 1;
    };
  }, [loadWorkspacesList]);

  const beginOperation = (name) => {
    if (operationRef.current) return false;
    operationRef.current = true;
    setBusyAction(name);
    setActionError("");
    return true;
  };

  const finishOperation = () => {
    operationRef.current = false;
    if (mountedRef.current) setBusyAction("");
  };

  const selectOpenedWorkspace = (workspace) => {
    if (mountedRef.current) onSelectWorkspace(workspace);
  };

  const handleCreateWorkspace = async (event) => {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    const path = workspacePath.trim();

    if (!name || !path) {
      setActionError(t("workspace.missingCreateFields"));
      return;
    }
    if (!beginOperation("create")) return;

    try {
      const workspace = await createWorkspace({ name, path });
      selectOpenedWorkspace(workspace);
    } catch (error) {
      if (mountedRef.current) setActionError(getErrorMessage(error));
    } finally {
      finishOperation();
    }
  };

  const handleOpenWorkspace = async (path) => {
    if (!beginOperation(`open:${path}`)) return;

    try {
      const workspace = await openWorkspace({ path });
      selectOpenedWorkspace(workspace);
    } catch (error) {
      if (mountedRef.current) setActionError(getErrorMessage(error));
    } finally {
      finishOperation();
    }
  };

  const handleOpenExistingPath = async () => {
    const path = workspacePath.trim();
    if (!path) {
      setActionError(t("workspace.missingOpenPath"));
      return;
    }
    await handleOpenWorkspace(path);
  };

  const handleDeleteWorkspace = async (workspace) => {
    const confirmed = await showConfirm(
      t("workspace.removeConfirm", { name: workspace.name }),
      {
        title: t("workspace.removeTitle"),
        tone: "danger",
        confirmText: t("workspace.remove"),
      },
    );
    if (!confirmed || !beginOperation(`delete:${workspace.id}`)) return;

    try {
      await deleteWorkspace({ id: workspace.id });
      if (mountedRef.current) await loadWorkspacesList();
    } catch (error) {
      if (mountedRef.current) setActionError(getErrorMessage(error));
    } finally {
      finishOperation();
    }
  };

  const handleSelectFolder = async () => {
    if (!beginOperation("select-directory")) return;

    try {
      const selectedPath = await selectDirectory();
      if (mountedRef.current && selectedPath) {
        setWorkspacePath(selectedPath);
        setNewWorkspaceName((currentName) =>
          currentName.trim() ? currentName : getFolderName(selectedPath, t("nav.albums")),
        );
      }
    } catch (error) {
      if (mountedRef.current) setActionError(getErrorMessage(error));
    } finally {
      finishOperation();
    }
  };

  const controlsDisabled = Boolean(busyAction);

  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-labelledby="workspace-welcome-title">
        <header className={styles.header}>
          <span className={styles.logo} aria-hidden="true">
            <Camera size={30} strokeWidth={1.8} />
          </span>
          <div>
            <p className={styles.eyebrow}>PhotoManager</p>
            <h1 id="workspace-welcome-title">{t("workspace.selectTitle")}</h1>
            <p>{t("workspace.selectDescription")}</p>
          </div>
        </header>

        {actionError ? (
          <div className={styles.actionError} role="alert">
            <strong>{t("workspace.actionFailed")}</strong>
            <span>{actionError}</span>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={handleCreateWorkspace}>
          <Field
            label={t("workspace.localFolder")}
            htmlFor="workspace-path"
            hint={t("workspace.folderHint")}
          >
            <div className={styles.pathControl}>
              <input
                id="workspace-path"
                className={styles.input}
                type="text"
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder={t("workspace.pathPlaceholder")}
                autoComplete="off"
                disabled={controlsDisabled}
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleSelectFolder}
                disabled={controlsDisabled}
              >
                {busyAction === "select-directory" ? (
                  <Spinner label={t("workspace.selectingFolder")} size="small" />
                ) : (
                  <FolderOpen size={16} aria-hidden="true" />
                )}
                {t("workspace.selectFolder")}
              </Button>
            </div>
          </Field>

          <Field label={t("workspace.name")} htmlFor="workspace-name">
            <input
              id="workspace-name"
              className={styles.input}
              type="text"
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              placeholder={t("workspace.namePlaceholder")}
              autoComplete="off"
              disabled={controlsDisabled}
            />
          </Field>

          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={controlsDisabled}>
              {busyAction === "create" ? (
                <Spinner label={t("workspace.creating")} size="small" />
              ) : (
                <Plus size={17} aria-hidden="true" />
              )}
              {t("workspace.create")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleOpenExistingPath}
              disabled={controlsDisabled}
            >
              {busyAction === `open:${workspacePath.trim()}` ? (
                <Spinner label={t("workspace.opening")} size="small" />
              ) : (
                <HardDrive size={17} aria-hidden="true" />
              )}
              {t("workspace.openExisting")}
            </Button>
          </div>
        </form>

        <section className={styles.recents} aria-labelledby="recent-workspaces-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="recent-workspaces-title">{t("workspace.recents")}</h2>
              <p>{t("workspace.recentsDescription")}</p>
            </div>
            {!listLoading && listError ? (
              <Button
                type="button"
                variant="ghost"
                size="small"
                onClick={loadWorkspacesList}
                disabled={controlsDisabled}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {t("common.retry")}
              </Button>
            ) : null}
          </div>

          {listLoading ? (
            <div className={styles.listStatus} role="status">
              <Spinner label={t("workspace.loadingRecents")} />
            </div>
          ) : listError ? (
            <EmptyState
              icon={<HardDrive size={24} />}
              title={t("workspace.loadFailed")}
              description={listError}
              role="alert"
            />
          ) : workspaces.length === 0 ? (
            <EmptyState
              icon={<HardDrive size={24} />}
              title={t("workspace.empty")}
              description={t("workspace.emptyDescription")}
            />
          ) : (
            <ul className={styles.recentList}>
              {workspaces.map((workspace) => {
                const opening = busyAction === `open:${workspace.path}`;
                const deleting = busyAction === `delete:${workspace.id}`;
                return (
                  <li key={workspace.id} className={styles.recentItem}>
                    <button
                      type="button"
                      className={styles.recentOpen}
                      onClick={() => handleOpenWorkspace(workspace.path)}
                      disabled={controlsDisabled}
                      aria-label={t("workspace.openLabel", { name: workspace.name })}
                    >
                      <span className={styles.recentIcon} aria-hidden="true">
                        {opening ? (
                          <Spinner label={t("workspace.opening")} size="small" />
                        ) : (
                          <FolderOpen size={18} />
                        )}
                      </span>
                      <span className={styles.recentInfo}>
                        <strong>{workspace.name}</strong>
                        <span>{workspace.path}</span>
                      </span>
                      {workspace.lastOpened ? (
                        <time className={styles.lastOpened}>{workspace.lastOpened}</time>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      className={styles.deleteButton}
                      onClick={() => handleDeleteWorkspace(workspace)}
                      disabled={controlsDisabled}
                      aria-label={t("workspace.removeLabel", { name: workspace.name })}
                      title={t("workspace.removeHint")}
                    >
                      {deleting ? (
                        <Spinner label={t("workspace.removing")} size="small" />
                      ) : (
                        <Trash2 size={16} aria-hidden="true" />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
