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
import { Button, EmptyState, Field, Spinner, useGlobalDialog } from "./ui";
import styles from "./WorkspaceSelector.module.css";

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const sortWorkspaces = (workspaces) =>
  [...workspaces].sort((left, right) =>
    String(right.lastOpened ?? "").localeCompare(String(left.lastOpened ?? "")),
  );

function getFolderName(path) {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) || "本地图库";
}

export default function WorkspaceSelector({ onSelectWorkspace }) {
  const { confirm: showConfirm } = useGlobalDialog();
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
      setActionError("请填写工作区名称并选择本地文件夹。");
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
      setActionError("请选择或输入已有工作区的文件夹路径。");
      return;
    }
    await handleOpenWorkspace(path);
  };

  const handleDeleteWorkspace = async (workspace) => {
    const confirmed = await showConfirm(
      `确定从最近工作区中移除“${workspace.name}”吗？\n磁盘上的照片文件不会被删除。`,
      {
        title: "移除最近工作区",
        tone: "danger",
        confirmText: "确认移除",
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
          currentName.trim() ? currentName : getFolderName(selectedPath),
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
            <h1 id="workspace-welcome-title">选择照片工作区</h1>
            <p>照片保留在本地物理目录中，选择一个文件夹即可开始整理。</p>
          </div>
        </header>

        {actionError ? (
          <div className={styles.actionError} role="alert">
            <strong>操作未完成</strong>
            <span>{actionError}</span>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={handleCreateWorkspace}>
          <Field
            label="本地文件夹"
            htmlFor="workspace-path"
            hint="新建工作区时请选择空文件夹；也可以输入已有工作区路径。"
          >
            <div className={styles.pathControl}>
              <input
                id="workspace-path"
                className={styles.input}
                type="text"
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="例如 D:\\Photos"
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
                  <Spinner label="正在选择目录" size="small" />
                ) : (
                  <FolderOpen size={16} aria-hidden="true" />
                )}
                选择目录
              </Button>
            </div>
          </Field>

          <Field label="工作区名称" htmlFor="workspace-name">
            <input
              id="workspace-name"
              className={styles.input}
              type="text"
              value={newWorkspaceName}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
              placeholder="例如：我的摄影图库"
              autoComplete="off"
              disabled={controlsDisabled}
            />
          </Field>

          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={controlsDisabled}>
              {busyAction === "create" ? (
                <Spinner label="正在创建工作区" size="small" />
              ) : (
                <Plus size={17} aria-hidden="true" />
              )}
              创建并进入
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleOpenExistingPath}
              disabled={controlsDisabled}
            >
              {busyAction === `open:${workspacePath.trim()}` ? (
                <Spinner label="正在打开工作区" size="small" />
              ) : (
                <HardDrive size={17} aria-hidden="true" />
              )}
              打开已有工作区
            </Button>
          </div>
        </form>

        <section className={styles.recents} aria-labelledby="recent-workspaces-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="recent-workspaces-title">最近工作区</h2>
              <p>快速回到最近整理过的照片目录。</p>
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
                重试
              </Button>
            ) : null}
          </div>

          {listLoading ? (
            <div className={styles.listStatus} role="status">
              <Spinner label="正在加载最近工作区" />
            </div>
          ) : listError ? (
            <EmptyState
              icon={<HardDrive size={24} />}
              title="无法加载最近工作区"
              description={listError}
              role="alert"
            />
          ) : workspaces.length === 0 ? (
            <EmptyState
              icon={<HardDrive size={24} />}
              title="还没有最近工作区"
              description="创建新工作区或打开已有目录后，它会显示在这里。"
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
                      aria-label={`打开工作区 ${workspace.name}`}
                    >
                      <span className={styles.recentIcon} aria-hidden="true">
                        {opening ? (
                          <Spinner label="正在打开" size="small" />
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
                      aria-label={`从记录中移除 ${workspace.name}`}
                      title="仅从最近记录中移除，不删除照片文件"
                    >
                      {deleting ? (
                        <Spinner label="正在移除" size="small" />
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
