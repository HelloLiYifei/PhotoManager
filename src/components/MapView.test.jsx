import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MapView from "./MapView";

const serviceMocks = vi.hoisted(() => ({
  getPhotos: vi.fn(),
  loadPhotoThumbnail: vi.fn(),
}));

const leafletMocks = vi.hoisted(() => {
  const state = {
    maps: [],
    markers: [],
    tileLayers: [],
    markerClusters: [],
  };

  function makeMap() {
    const map = {
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      remove: vi.fn(),
      setView: vi.fn(),
    };
    state.maps.push(map);
    return map;
  }

  function makeMarker(coordinates, options) {
    const handlers = {};
    const marker = {
      coordinates,
      options,
      addTo: vi.fn().mockReturnThis(),
      getLatLng: vi.fn(() => ({ lat: coordinates[0], lng: coordinates[1] })),
      on: vi.fn((event, callback) => {
        handlers[event] = callback;
        return marker;
      }),
      setIcon: vi.fn(),
      trigger(event) {
        handlers[event]?.();
      },
    };
    state.markers.push(marker);
    return marker;
  }

  function makeTileLayer() {
    const handlers = {};
    const layer = {
      addTo: vi.fn().mockReturnThis(),
      on: vi.fn((event, callback) => {
        handlers[event] = callback;
        return layer;
      }),
      trigger(event) {
        handlers[event]?.();
      },
    };
    state.tileLayers.push(layer);
    return layer;
  }

  function makeMarkerCluster(options = {}) {
    const handlers = {};
    const layer = {
      options,
      addTo: vi.fn().mockReturnThis(),
      on: vi.fn((event, callback) => {
        handlers[event] = callback;
        return layer;
      }),
      refreshClusters: vi.fn(),
      zoomToShowLayer: vi.fn((marker, callback) => callback(marker)),
      trigger(event, payload) {
        handlers[event]?.(payload);
      },
    };
    state.markerClusters.push(layer);
    return layer;
  }

  return {
    state,
    api: {
      divIcon: vi.fn((options) => options),
      latLngBounds: vi.fn(() => ({ extend: vi.fn() })),
      layerGroup: vi.fn(() => makeMarkerCluster()),
      map: vi.fn(makeMap),
      marker: vi.fn(makeMarker),
      markerClusterGroup: vi.fn(makeMarkerCluster),
      tileLayer: vi.fn(makeTileLayer),
    },
  };
});

vi.mock("../services/photoService", () => ({
  getPhotos: serviceMocks.getPhotos,
}));

vi.mock("../lib/thumbnailLoader", () => ({
  loadPhotoThumbnail: serviceMocks.loadPhotoThumbnail,
}));

vi.mock("leaflet", () => ({ default: leafletMocks.api }));

const GPS_PHOTOS = [
  { id: 1, filename: "湖边.jpg", latitude: 30.250001, longitude: 120.160001 },
  { id: 2, filename: "湖边合影.jpg", latitude: 30.250001, longitude: 120.160001 },
  { id: 3, filename: "山顶.jpg", latitude: 31.100001, longitude: 121.200001 },
];

describe("MapView", () => {
  beforeEach(() => {
    serviceMocks.getPhotos.mockReset();
    serviceMocks.loadPhotoThumbnail.mockReset();
    serviceMocks.loadPhotoThumbnail.mockResolvedValue("data:image/jpeg;base64,map");
    leafletMocks.state.maps.length = 0;
    leafletMocks.state.markers.length = 0;
    leafletMocks.state.tileLayers.length = 0;
    leafletMocks.state.markerClusters.length = 0;
    Object.values(leafletMocks.api).forEach((mock) => mock.mockClear());
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the shared spinner while GPS metadata is loading", () => {
    serviceMocks.getPhotos.mockReturnValue(new Promise(() => {}));
    render(<MapView />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取 GPS 元数据");
  });

  it("shows the shared empty state when no photo has valid coordinates", async () => {
    serviceMocks.getPhotos.mockResolvedValue([
      { id: 1, filename: "无位置.jpg", latitude: null, longitude: null },
      { id: 2, filename: "越界.jpg", latitude: 200, longitude: 120 },
    ]);

    render(<MapView />);
    expect(await screen.findByRole("heading", { name: "暂无带位置信息的照片" }))
      .toBeInTheDocument();
    expect(leafletMocks.api.map).not.toHaveBeenCalled();
  });

  it("shows a semantic warning after repeated base-tile failures", async () => {
    serviceMocks.getPhotos.mockResolvedValue(GPS_PHOTOS);
    render(<MapView />);

    await screen.findByLabelText("照片位置地图");
    const tileLayer = leafletMocks.state.tileLayers[0];
    act(() => {
      tileLayer.trigger("tileerror");
      tileLayer.trigger("tileerror");
      tileLayer.trigger("tileerror");
    });
    expect(screen.getByText(/地图底图暂时无法连接/).closest('[role="status"]'))
      .toBeInTheDocument();
  });

  it("shows one cover thumbnail, opens an indexed album, and follows focus", async () => {
    serviceMocks.getPhotos.mockResolvedValue(GPS_PHOTOS);
    const onOpenTemporaryAlbum = vi.fn();
    const { rerender } = render(
      <MapView onOpenTemporaryAlbum={onOpenTemporaryAlbum} />,
    );

    await waitFor(() => expect(leafletMocks.state.markers).toHaveLength(2));
    const firstMarker = leafletMocks.state.markers[0];
    await waitFor(() => {
      expect(serviceMocks.loadPhotoThumbnail).toHaveBeenCalledWith(1, 2);
      expect(firstMarker.setIcon).toHaveBeenCalled();
    });
    const coverIcon = firstMarker.setIcon.mock.calls.at(-1)[0];
    expect(coverIcon.html.match(/<img /g)).toHaveLength(1);

    firstMarker.trigger("click");
    expect(onOpenTemporaryAlbum).toHaveBeenCalledWith({
      photoIds: [1, 2],
      latitude: GPS_PHOTOS[0].latitude,
      longitude: GPS_PHOTOS[0].longitude,
    });

    const map = leafletMocks.state.maps[0];
    const focusedMarker = leafletMocks.state.markers[1];
    rerender(
      <MapView onOpenTemporaryAlbum={onOpenTemporaryAlbum} focusedPhotoId={3} />,
    );
    expect(leafletMocks.api.map).toHaveBeenCalledTimes(1);
    expect(map.setView).toHaveBeenLastCalledWith(
      { lat: GPS_PHOTOS[2].latitude, lng: GPS_PHOTOS[2].longitude },
      15,
    );
    expect(leafletMocks.state.markerClusters[0].zoomToShowLayer)
      .toHaveBeenCalledWith(focusedMarker, expect.any(Function));
  });

  it("clusters nearby markers, counts all photos, and shows one cover", async () => {
    serviceMocks.getPhotos.mockResolvedValue(GPS_PHOTOS);
    render(<MapView />);

    await waitFor(() => {
      expect(leafletMocks.api.markerClusterGroup).toHaveBeenCalledOnce();
    });
    const options = leafletMocks.api.markerClusterGroup.mock.calls[0][0];
    expect(options).toMatchObject({
      maxClusterRadius: 68,
      disableClusteringAtZoom: 18,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: false,
    });

    const icon = options.iconCreateFunction({
      getAllChildMarkers: () => [
        { options: { photoCount: 2, thumbnailSrc: "asset://cover" } },
        { options: { photoCount: 1 } },
      ],
    });
    expect(icon.html).toContain(">3<");
    expect(icon.html.match(/<img /g)).toHaveLength(1);
  });

  it("opens every clustered photo as one indexed temporary album", async () => {
    serviceMocks.getPhotos.mockResolvedValue(GPS_PHOTOS);
    const onOpenTemporaryAlbum = vi.fn();
    render(<MapView onOpenTemporaryAlbum={onOpenTemporaryAlbum} />);

    await waitFor(() => expect(leafletMocks.state.markers).toHaveLength(2));
    const markerCluster = leafletMocks.state.markerClusters[0];
    const coordinates = { lat: 30.5, lng: 120.5 };
    markerCluster.trigger("clusterclick", {
      layer: {
        getLatLng: () => coordinates,
        getAllChildMarkers: () => leafletMocks.state.markers,
      },
    });

    expect(onOpenTemporaryAlbum).toHaveBeenCalledWith({
      photoIds: [1, 2, 3],
      latitude: coordinates.lat,
      longitude: coordinates.lng,
    });
  });

  it("offers retry when loading locations fails", async () => {
    serviceMocks.getPhotos
      .mockRejectedValueOnce(new Error("仓库暂时不可用"))
      .mockResolvedValueOnce([]);
    render(<MapView />);

    expect(await screen.findByRole("heading", { name: "无法加载照片位置" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByRole("heading", { name: "暂无带位置信息的照片" });
    expect(serviceMocks.getPhotos).toHaveBeenCalledTimes(2);
  });
});
