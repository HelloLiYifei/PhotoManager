import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

import AlbumsPage from "./components/AlbumsPage";
import CreateAlbumDialog from "./components/CreateAlbumDialog";
import ImportWizard from "./components/ImportWizard";
import LightboxViewer from "./components/LightboxViewer";
import MapView from "./components/MapView";
import SettingsPage from "./components/SettingsPage";
import { AppShell, Sidebar } from "./components/shell";
import TimelineGrid from "./components/TimelineGrid";
import WorkspaceSelector from "./components/WorkspaceSelector";
import { useGlobalDialog } from "./components/ui";
import { useI18n } from "./i18n";
import { useSettings } from "./settings";
import { createAlbum, getAlbumSummaries } from "./services/albumService";
import { detectCards } from "./services/importService";
import { getActiveWorkspace, getWorkspaces } from "./services/workspaceService";

const WIDE_SIDEBAR_QUERY = "(min-width: 1200px)";

function getInitialWideViewport() {
  if (typeof window === "undefined") return true;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(WIDE_SIDEBAR_QUERY).matches;
  }
  return window.innerWidth >= 1200;
}

function getViewTitle(currentView, activeAlbumName, t) {
  switch (currentView) {
    case "albums":
      return t("nav.albums");
    case "favorites":
      return t("nav.favorites");
    case "trash":
      return t("nav.trash");
    case "map":
      return t("nav.map");
    case "settings":
      return t("nav.settings");
    case "album":
      return activeAlbumName || t("nav.albums");
    default:
      return t("nav.albums");
  }
}

function App() {
  const { confirm: showConfirm } = useGlobalDialog();
  const { t } = useI18n();
  const { getWorkspaceSettings } = useSettings();
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [currentView, setCurrentView] = useState("albums");
  const [activeAlbumId, setActiveAlbumId] = useState(null);
  const [activeAlbumName, setActiveAlbumName] = useState("");
  const [isWideViewport, setIsWideViewport] = useState(getInitialWideViewport);
  const [isWideSidebarCollapsed, setIsWideSidebarCollapsed] = useState(false);
  const [isCompactSidebarOpen, setIsCompactSidebarOpen] = useState(false);

  const [albums, setAlbums] = useState([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [albumsError, setAlbumsError] = useState(null);
  const albumsRequestIdRef = useRef(0);
  const [detectedCard, setDetectedCard] = useState(null);

  const [showImportWizard, setShowImportWizard] = useState(false);
  const [lightboxData, setLightboxData] = useState(null);
  const [mapFocusedPhotoId, setMapFocusedPhotoId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");
  const [createAlbumBusy, setCreateAlbumBusy] = useState(false);
  const [createAlbumError, setCreateAlbumError] = useState(null);

  const sidebarMode = isWideViewport
    ? isWideSidebarCollapsed
      ? "collapsed"
      : "expanded"
    : isCompactSidebarOpen
      ? "overlay"
      : "collapsed";

  const closeCompactSidebar = useCallback(() => {
    setIsCompactSidebarOpen(false);
  }, []);

  const checkActiveWorkspace = useCallback(async () => {
    try {
      const activePath = await getActiveWorkspace();
      if (!activePath) return;

      const workspaces = await getWorkspaces();
      const match = workspaces.find((workspace) => workspace.path === activePath);
      if (match) {
        setAlbumsLoading(true);
        setActiveWorkspace(match);
        return;
      }

      const folderName = activePath.split(/[/\\]/).pop() || t("workspace.localAlbum");
      setAlbumsLoading(true);
      setActiveWorkspace({ name: folderName, path: activePath });
    } catch (error) {
      console.error(error);
    }
  }, [t]);

  const checkSDCards = useCallback(async () => {
    try {
      const cards = await detectCards();
      setDetectedCard(cards[0] || null);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const loadAlbums = useCallback(async () => {
    const requestId = ++albumsRequestIdRef.current;
    setAlbumsLoading(true);
    setAlbumsError(null);

    try {
      const list = await getAlbumSummaries();
      if (requestId === albumsRequestIdRef.current) setAlbums(list);
    } catch (error) {
      if (requestId === albumsRequestIdRef.current) setAlbumsError(error);
    } finally {
      if (requestId === albumsRequestIdRef.current) setAlbumsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkActiveWorkspace();
  }, [checkActiveWorkspace]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      const handleResize = () => {
        setIsWideViewport(window.innerWidth >= 1200);
        setIsCompactSidebarOpen(false);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const mediaQuery = window.matchMedia(WIDE_SIDEBAR_QUERY);
    const handleChange = (event) => {
      setIsWideViewport(event.matches);
      setIsCompactSidebarOpen(false);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!activeWorkspace) return undefined;

    checkSDCards();
    const interval = setInterval(checkSDCards, 8000);
    return () => clearInterval(interval);
  }, [activeWorkspace, checkSDCards]);

  useEffect(() => {
    if (activeWorkspace) {
      loadAlbums();
      return;
    }

    albumsRequestIdRef.current += 1;
    setAlbums([]);
    setAlbumsError(null);
    setAlbumsLoading(false);
  }, [activeWorkspace, loadAlbums, refreshTrigger]);

  const handleToggleSidebar = useCallback(
    (requestedMode) => {
      if (isWideViewport) {
        setIsWideSidebarCollapsed((current) =>
          requestedMode ? requestedMode === "collapsed" : !current,
        );
        return;
      }

      setIsCompactSidebarOpen((current) =>
        requestedMode ? requestedMode !== "collapsed" : !current,
      );
    },
    [isWideViewport],
  );

  const handleSelectWorkspace = (workspace) => {
    setAlbumsLoading(true);
    setActiveWorkspace(workspace);
    setCurrentView("albums");
    setActiveAlbumId(null);
    setActiveAlbumName("");
    closeCompactSidebar();
  };

  const handleSwitchWorkspace = async () => {
    const confirmed = await showConfirm(t("nav.switchConfirm"), {
      title: t("nav.switchConfirmTitle"),
      confirmText: t("nav.switchConfirmAction"),
    });
    if (!confirmed) return;

    albumsRequestIdRef.current += 1;
    setActiveWorkspace(null);
    setActiveAlbumId(null);
    setActiveAlbumName("");
    setDetectedCard(null);
    closeCompactSidebar();
  };

  const handleNavigate = (view) => {
    setCurrentView(view);
    setActiveAlbumId(null);
    setActiveAlbumName("");
    if (view === "map") setMapFocusedPhotoId(null);
    closeCompactSidebar();
  };

  const handleOpenAlbum = (album) => {
    setCurrentView("album");
    setActiveAlbumId(album.id);
    setActiveAlbumName(album.name);
    closeCompactSidebar();
  };

  const handleOpenCreateAlbum = () => {
    setCreateAlbumError(null);
    setShowCreateAlbum(true);
    closeCompactSidebar();
  };

  const handleCloseCreateAlbum = () => {
    if (createAlbumBusy) return;
    setShowCreateAlbum(false);
    setCreateAlbumError(null);
    setNewAlbumName("");
    setNewAlbumDesc("");
  };

  const handleCreateAlbumSubmit = async () => {
    if (createAlbumBusy || !newAlbumName.trim()) return;

    setCreateAlbumBusy(true);
    setCreateAlbumError(null);
    try {
      await createAlbum({
        name: newAlbumName.trim(),
        description: newAlbumDesc.trim() || null,
      });
      setShowCreateAlbum(false);
      setNewAlbumName("");
      setNewAlbumDesc("");
      void loadAlbums();
    } catch (error) {
      setCreateAlbumError(error);
    } finally {
      setCreateAlbumBusy(false);
    }
  };

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((previous) => previous + 1);
  }, []);

  if (!activeWorkspace) {
    return <WorkspaceSelector onSelectWorkspace={handleSelectWorkspace} />;
  }

  const viewTitle = getViewTitle(currentView, activeAlbumName, t);
  const workspaceSettings = getWorkspaceSettings(activeWorkspace);

  const sidebar = (
    <Sidebar
      workspace={activeWorkspace}
      currentView={currentView}
      activeAlbumId={activeAlbumId}
      albums={albums}
      detectedCard={detectedCard}
      mode={sidebarMode}
      currentTitle={viewTitle}
      onNavigate={handleNavigate}
      onOpenAlbum={handleOpenAlbum}
      onCreateAlbum={handleOpenCreateAlbum}
      onImport={() => {
        setShowImportWizard(true);
        closeCompactSidebar();
      }}
      onSwitchWorkspace={handleSwitchWorkspace}
      onToggleMode={handleToggleSidebar}
      onShowSettings={() => {
        setCurrentView("settings");
        setActiveAlbumId(null);
        setActiveAlbumName("");
        closeCompactSidebar();
      }}
    />
  );

  return (
    <>
      <AppShell
        sidebar={sidebar}
        sidebarMode={sidebarMode}
        onRequestSidebarClose={closeCompactSidebar}
        contentLabel={viewTitle}
      >
        {currentView === "settings" ? (
          <SettingsPage
            workspace={activeWorkspace}
            sidebarMode={sidebarMode}
            onToggleSidebar={handleToggleSidebar}
            onWorkspaceChanged={() => {
              triggerRefresh();
              void loadAlbums();
            }}
          />
        ) : currentView === "map" ? (
          <MapView
            key={`map-${refreshTrigger}`}
            focusedPhotoId={mapFocusedPhotoId}
            onShowPhoto={(photo) => setLightboxData({ photosList: [photo], index: 0 })}
          />
        ) : currentView === "albums" ? (
          <AlbumsPage
            albums={albums}
            loading={albumsLoading}
            error={albumsError}
            onRetry={loadAlbums}
            onOpenAlbum={handleOpenAlbum}
            onCreateAlbum={handleOpenCreateAlbum}
          />
        ) : (
          <TimelineGrid
            workspace={activeWorkspace}
            currentView={currentView}
            albumId={activeAlbumId}
            refreshTrigger={refreshTrigger}
            onPhotosUpdated={triggerRefresh}
            onPhotoClick={(list, index) => setLightboxData({ photosList: list, index })}
          />
        )}
      </AppShell>

      <CreateAlbumDialog
        open={showCreateAlbum}
        name={newAlbumName}
        description={newAlbumDesc}
        busy={createAlbumBusy}
        error={createAlbumError}
        onNameChange={setNewAlbumName}
        onDescriptionChange={setNewAlbumDesc}
        onSubmit={handleCreateAlbumSubmit}
        onClose={handleCloseCreateAlbum}
      />

      {showImportWizard && (
        <ImportWizard
          workspace={activeWorkspace}
          onClose={() => setShowImportWizard(false)}
          onImportComplete={triggerRefresh}
          preferences={workspaceSettings}
        />
      )}

      {lightboxData && (
        <LightboxViewer
          photosList={lightboxData.photosList}
          initialIndex={lightboxData.index}
          onClose={() => setLightboxData(null)}
          onShowOnMap={(photo) => {
            setMapFocusedPhotoId(photo.id);
            setLightboxData(null);
            setCurrentView("map");
          }}
          onPhotosUpdated={triggerRefresh}
        />
      )}
    </>
  );
}

export default App;
