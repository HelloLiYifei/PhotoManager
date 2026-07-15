import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Brush,
  Check,
  Database,
  FolderOpen,
  HardDrive,
  Images,
  Info,
  Languages,
  LoaderCircle,
  MapPin,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useI18n } from "../i18n";
import {
  clearWorkspaceCache,
  getWorkspaceStorageStats,
  listenToScanProgress,
  scanWorkspace,
} from "../services/settingsService";
import { selectDirectory } from "../services/workspaceService";
import { useSettings } from "../settings";
import { PageHeader } from "./shell";
import { Button, Select, useGlobalDialog } from "./ui";
import styles from "./SettingsPage.module.css";

const SECTIONS = [
  { id: "general", labelKey: "settings.general", Icon: Brush },
  { id: "library", labelKey: "settings.library", Icon: Images },
  { id: "workspace", labelKey: "settings.workspace", Icon: Database },
  { id: "about", labelKey: "settings.about", Icon: Info },
];

const VIEW_OPTIONS = ["masonry", "list", "gallery"];

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unknown error";
}

function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? styles.segmentActive : undefined}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, children, danger = false }) {
  return (
    <div className={`${styles.settingRow}${danger ? ` ${styles.dangerRow}` : ""}`}>
      <div className={styles.settingCopy}>
        {Icon ? <span className={styles.settingIcon}><Icon aria-hidden="true" /></span> : null}
        <span>
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </span>
      </div>
      <div className={styles.settingControl}>{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`${styles.switch}${checked ? ` ${styles.switchOn}` : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

function StatCard({ Icon, label, value, detail }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statIcon}><Icon aria-hidden="true" /></span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail ? <em>{detail}</em> : null}
      </span>
    </div>
  );
}

export default function SettingsPage({
  workspace,
  sidebarMode = "expanded",
  onToggleSidebar,
  onWorkspaceChanged,
}) {
  const { t, formatBytes, formatNumber } = useI18n();
  const { confirm: showConfirm } = useGlobalDialog();
  const {
    globalSettings,
    getWorkspaceSettings,
    persistenceError,
    resetAll,
    updateGlobal,
    updateWorkspace,
  } = useSettings();
  const workspaceSettings = getWorkspaceSettings(workspace);
  const [activeSection, setActiveSection] = useState("general");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [operation, setOperation] = useState("");
  const [operationStatus, setOperationStatus] = useState("");
  const [scanProgress, setScanProgress] = useState(null);
  const [saveNotice, setSaveNotice] = useState("");
  const saveTimerRef = useRef(null);

  const announceSaved = useCallback((message = t("common.saved")) => {
    setSaveNotice(message);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveNotice(""), 1800);
  }, [t]);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");
    try {
      setStats(await getWorkspaceStorageStats());
    } catch (error) {
      setStatsError(errorMessage(error));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats, workspace?.path]);

  const changeGlobal = (patch) => {
    updateGlobal(patch);
    announceSaved();
  };

  const changeWorkspace = (patch) => {
    updateWorkspace(workspace, patch);
    announceSaved();
  };

  const browseBackup = async () => {
    try {
      const path = await selectDirectory();
      if (path) changeWorkspace({ backupPath: path });
    } catch (error) {
      setOperationStatus(t("settings.operationError", { message: errorMessage(error) }));
    }
  };

  const handleScan = async () => {
    setOperation("scan");
    setOperationStatus("");
    setScanProgress({ scanned: 0, total: 0 });
    let unlisten = null;
    try {
      unlisten = await listenToScanProgress((event) => setScanProgress(event.payload));
      const result = await scanWorkspace();
      setOperationStatus(t("settings.scanDone", {
        scanned: formatNumber(result.scanned),
        added: formatNumber(result.added),
        removed: formatNumber(result.removed),
      }));
      onWorkspaceChanged?.();
      await loadStats();
    } catch (error) {
      setOperationStatus(t("settings.operationError", { message: errorMessage(error) }));
    } finally {
      unlisten?.();
      setOperation("");
      setScanProgress(null);
    }
  };

  const handleClearCache = async (kind) => {
    const nameKey = kind === "thumbnails"
      ? "settings.cache.thumbnailName"
      : "settings.cache.importPreviewName";
    const confirmed = await showConfirm(
      t("settings.clearConfirm", { name: t(nameKey) }),
      {
        title: t("settings.clearConfirmTitle"),
        tone: "warning",
        confirmText: t("common.clear"),
        cancelText: t("common.cancel"),
      },
    );
    if (!confirmed) return;

    setOperation(kind);
    setOperationStatus("");
    try {
      const result = await clearWorkspaceCache({ kind });
      setOperationStatus(t("settings.clearDone", {
        files: formatNumber(result.filesRemoved),
        bytes: formatBytes(result.bytesFreed),
      }));
      globalThis.dispatchEvent?.(new CustomEvent("photomanager-cache-cleared", {
        detail: { kind },
      }));
      await loadStats();
    } catch (error) {
      setOperationStatus(t("settings.operationError", { message: errorMessage(error) }));
    } finally {
      setOperation("");
    }
  };

  const handleReset = async () => {
    const confirmed = await showConfirm(t("settings.resetConfirm"), {
      title: t("settings.resetConfirmTitle"),
      tone: "warning",
      confirmText: t("settings.reset"),
      cancelText: t("common.cancel"),
    });
    if (!confirmed) return;
    resetAll();
    announceSaved(t("settings.resetDone"));
  };

  const themeOptions = ["system", "dark", "light"].map((value) => ({
    value,
    label: t(`settings.theme.${value}`),
  }));
  const densityOptions = ["comfortable", "compact"].map((value) => ({
    value,
    label: t(`settings.density.${value}`),
  }));
  const motionOptions = ["system", "full", "reduced"].map((value) => ({
    value,
    label: t(`settings.motion.${value}`),
  }));
  const viewOptions = VIEW_OPTIONS.map((value) => ({
    value,
    label: t(`settings.view.${value}`),
  }));

  return (
    <section className={styles.page} aria-labelledby="settings-page-title">
      <PageHeader
        title={t("settings.title")}
        titleId="settings-page-title"
        description={t("settings.description")}
        workspaceName={workspace?.name}
        sidebarMode={sidebarMode}
        onToggleSidebar={onToggleSidebar}
        actions={saveNotice ? (
          <span className={styles.savedBadge} role="status">
            <Check aria-hidden="true" /> {saveNotice}
          </span>
        ) : null}
      />

      <div className={styles.shell}>
        <nav className={styles.sectionNav} aria-label={t("settings.title")}>
          {SECTIONS.map(({ id, labelKey, Icon }) => (
            <button
              key={id}
              type="button"
              className={activeSection === id ? styles.sectionActive : undefined}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => setActiveSection(id)}
            >
              <Icon aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {persistenceError ? (
            <div className={styles.warning} role="alert">
              {t("settings.persistenceError")}
            </div>
          ) : null}

          {activeSection === "general" ? (
            <section className={styles.card} aria-labelledby="settings-general-heading">
              <header className={styles.cardHeader}>
                <Languages aria-hidden="true" />
                <h2 id="settings-general-heading">{t("settings.general")}</h2>
              </header>
              <SettingRow
                icon={Languages}
                title={t("settings.language")}
                description={t("settings.languageDescription")}
              >
                <Select
                  wrapperClassName={styles.languageSelect}
                  value={globalSettings.locale}
                  onChange={(locale) => changeGlobal({ locale })}
                  aria-label={t("settings.language")}
                  options={[
                    { value: "zh-CN", label: "简体中文" },
                    { value: "en-US", label: "English" },
                  ]}
                />
              </SettingRow>
              <SettingRow icon={Brush} title={t("settings.theme")} description={t("settings.themeDescription")}>
                <SegmentedControl label={t("settings.theme")} value={globalSettings.theme} options={themeOptions} onChange={(theme) => changeGlobal({ theme })} />
              </SettingRow>
              <SettingRow icon={AppWindow} title={t("settings.density")} description={t("settings.densityDescription")}>
                <SegmentedControl label={t("settings.density")} value={globalSettings.density} options={densityOptions} onChange={(density) => changeGlobal({ density })} />
              </SettingRow>
              <SettingRow icon={Sparkles} title={t("settings.motion")} description={t("settings.motionDescription")}>
                <SegmentedControl label={t("settings.motion")} value={globalSettings.motion} options={motionOptions} onChange={(motion) => changeGlobal({ motion })} />
              </SettingRow>
            </section>
          ) : null}

          {activeSection === "library" ? (
            <section className={styles.card} aria-labelledby="settings-library-heading">
              <header className={styles.cardHeader}>
                <Images aria-hidden="true" />
                <h2 id="settings-library-heading">{t("settings.library")}</h2>
              </header>
              <SettingRow icon={Images} title={t("settings.photoView")}>
                <SegmentedControl label={t("settings.photoView")} value={workspaceSettings.photoView} options={viewOptions} onChange={(photoView) => changeWorkspace({ photoView })} />
              </SettingRow>
              <SettingRow icon={ScanSearch} title={t("settings.importView")}>
                <SegmentedControl label={t("settings.importView")} value={workspaceSettings.importView} options={viewOptions} onChange={(importView) => changeWorkspace({ importView })} />
              </SettingRow>
              <SettingRow icon={HardDrive} title={t("settings.autoCard")} description={t("settings.autoCardDescription")}>
                <Switch label={t("settings.autoCard")} checked={workspaceSettings.autoSelectDetectedSource} onChange={(autoSelectDetectedSource) => changeWorkspace({ autoSelectDetectedSource })} />
              </SettingRow>
              <SettingRow icon={MapPin} title={t("settings.location")} description={t("settings.locationDescription")}>
                <Switch label={t("settings.location")} checked={workspaceSettings.attachCurrentLocation} onChange={(attachCurrentLocation) => changeWorkspace({ attachCurrentLocation })} />
              </SettingRow>
              <SettingRow icon={FolderOpen} title={t("settings.backup")} description={t("settings.backupDescription")}>
                <div className={styles.pathControl}>
                  <span title={workspaceSettings.backupPath}>{workspaceSettings.backupPath || t("settings.noBackup")}</span>
                  <Button variant="secondary" onClick={browseBackup}><FolderOpen aria-hidden="true" />{t("common.browse")}</Button>
                  {workspaceSettings.backupPath ? (
                    <Button variant="ghost" onClick={() => changeWorkspace({ backupPath: "" })}>{t("common.clear")}</Button>
                  ) : null}
                </div>
              </SettingRow>
            </section>
          ) : null}

          {activeSection === "workspace" ? (
            <div className={styles.cardStack}>
              <section className={styles.card} aria-labelledby="settings-workspace-heading">
                <header className={styles.cardHeader}>
                  <Database aria-hidden="true" />
                  <h2 id="settings-workspace-heading">{t("settings.workspace")}</h2>
                  <Button className={styles.refreshButton} variant="ghost" size="icon" onClick={loadStats} disabled={statsLoading} aria-label={t("common.retry")}>
                    <RefreshCw aria-hidden="true" />
                  </Button>
                </header>
                <dl className={styles.workspaceDetails}>
                  <div><dt>{t("settings.workspaceName")}</dt><dd>{workspace?.name || "—"}</dd></div>
                  <div><dt>{t("settings.workspacePath")}</dt><dd className={styles.mono}>{workspace?.path || "—"}</dd></div>
                  <div><dt>{t("settings.storageFormat")}</dt><dd>{t("settings.storageFormatValue")}</dd></div>
                </dl>

                {statsLoading ? (
                  <div className={styles.loading}><LoaderCircle aria-hidden="true" />{t("settings.stats.loading")}</div>
                ) : statsError ? (
                  <div className={styles.warning} role="alert">{t("settings.operationError", { message: statsError })}</div>
                ) : stats ? (
                  <div className={styles.statsGrid}>
                    <StatCard Icon={Images} label={t("settings.stats.photos")} value={formatNumber(stats.photoCount)} />
                    <StatCard Icon={Trash2} label={t("settings.stats.trash")} value={formatNumber(stats.trashCount)} />
                    <StatCard Icon={FolderOpen} label={t("settings.stats.albums")} value={formatNumber(stats.albumCount)} />
                    <StatCard Icon={HardDrive} label={t("settings.stats.originals")} value={formatBytes(stats.originalBytes)} />
                    <StatCard Icon={Database} label={t("settings.stats.database")} value={formatBytes(stats.databaseBytes)} />
                    <StatCard Icon={Images} label={t("settings.stats.thumbnails")} value={formatBytes(stats.thumbnailCache.bytes)} detail={t("settings.files", { count: formatNumber(stats.thumbnailCache.fileCount) })} />
                    <StatCard Icon={ScanSearch} label={t("settings.stats.importPreviews")} value={formatBytes(stats.importPreviewCache.bytes)} detail={t("settings.files", { count: formatNumber(stats.importPreviewCache.fileCount) })} />
                  </div>
                ) : null}
              </section>

              <section className={styles.card} aria-label={t("settings.workspace")}>
                <SettingRow icon={ScanSearch} title={t("settings.rescan")} description={t("settings.rescanDescription")}>
                  <Button variant="secondary" onClick={handleScan} disabled={Boolean(operation)}>
                    {operation === "scan" ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <ScanSearch aria-hidden="true" />}
                    {t("settings.rescan")}
                  </Button>
                </SettingRow>
                {scanProgress ? (
                  <div className={styles.progress} role="status">
                    <span style={{ width: scanProgress.total ? `${Math.min(100, (scanProgress.scanned / scanProgress.total) * 100)}%` : "4%" }} />
                    <small>{t("settings.scanning", { scanned: formatNumber(scanProgress.scanned), total: formatNumber(scanProgress.total) })}</small>
                  </div>
                ) : null}
                <SettingRow icon={Trash2} title={t("settings.clearThumbnails")} description={t("settings.clearCacheDescription")}>
                  <Button variant="secondary" onClick={() => handleClearCache("thumbnails")} disabled={Boolean(operation)}>
                    {operation === "thumbnails" ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                    {t("common.clear")}
                  </Button>
                </SettingRow>
                <SettingRow icon={Trash2} title={t("settings.clearImportPreviews")} description={t("settings.clearCacheDescription")}>
                  <Button variant="secondary" onClick={() => handleClearCache("importPreviews")} disabled={Boolean(operation)}>
                    {operation === "importPreviews" ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                    {t("common.clear")}
                  </Button>
                </SettingRow>
                {operationStatus ? <p className={styles.operationStatus} role="status">{operationStatus}</p> : null}
              </section>
            </div>
          ) : null}

          {activeSection === "about" ? (
            <section className={styles.card} aria-labelledby="settings-about-heading">
              <header className={styles.aboutHeader}>
                <span><Settings2 aria-hidden="true" /></span>
                <div>
                  <h2 id="settings-about-heading">PhotoManager</h2>
                  <p>{t("settings.aboutCopy")}</p>
                </div>
              </header>
              <dl className={styles.aboutDetails}>
                <div><dt>{t("settings.version")}</dt><dd>0.1.0</dd></div>
                <div><dt>{t("settings.formats")}</dt><dd>{t("settings.formatsValue")}</dd></div>
              </dl>
              <SettingRow danger icon={RotateCcw} title={t("settings.reset")} description={t("settings.resetDescription")}>
                <Button variant="danger" onClick={handleReset}><RotateCcw aria-hidden="true" />{t("settings.reset")}</Button>
              </SettingRow>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
