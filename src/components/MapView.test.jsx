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
      popupRoot: null,
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn((root) => {
        marker.popupRoot = root;
        return marker;
      }),
      getLatLng: vi.fn(() => ({
        lat: coordinates[0],
        lng: coordinates[1],
      })),
      on: vi.fn((event, callback) => {
        handlers[event] = callback;
        return marker;
      }),
      openPopup: vi.fn(),
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

  return {
    state,
    api: {
      divIcon: vi.fn((options) => options),
      latLngBounds: vi.fn(() => ({ extend: vi.fn() })),
      map: vi.fn(makeMap),
      marker: vi.fn(makeMarker),
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
  {
    id: 1,
    filename: "湖边.jpg",
    latitude: 30.250001,
    longitude: 120.160001,
  },
  {
    id: 2,
    filename: "湖边合影.jpg",
    latitude: 30.250001,
    longitude: 120.160001,
  },
  {
    id: 3,
    filename: "山顶.jpg",
    latitude: 31.100001,
    longitude: 121.200001,
  },
];

describe("MapView", () => {
  beforeEach(() => {
    serviceMocks.getPhotos.mockReset();
    serviceMocks.loadPhotoThumbnail.mockReset();
    serviceMocks.loadPhotoThumbnail.mockResolvedValue("data:image/jpeg;base64,map");
    leafletMocks.state.maps.length = 0;
    leafletMocks.state.markers.length = 0;
    leafletMocks.state.tileLayers.length = 0;
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

    expect(
      await screen.findByRole("heading", { name: "暂无带位置信息的照片" }),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(/地图底图暂时无法连接/).closest('[role="status"]'),
    ).toBeInTheDocument();
  });

  it("opens photos from a marker popup and follows focused-photo changes", async () => {
    serviceMocks.getPhotos.mockResolvedValue(GPS_PHOTOS);
    const onShowPhoto = vi.fn();
    const { rerender } = render(<MapView onShowPhoto={onShowPhoto} />);

    await waitFor(() => expect(leafletMocks.state.markers).toHaveLength(2));
    const firstMarker = leafletMocks.state.markers[0];
    firstMarker.trigger("popupopen");
    await waitFor(() => {
      expect(serviceMocks.loadPhotoThumbnail).toHaveBeenCalledWith(1, 2);
    });

    const firstPhotoButton = firstMarker.popupRoot.querySelector(
      'button[aria-label="查看照片 湖边.jpg"]',
    );
    fireEvent.click(firstPhotoButton);
    expect(onShowPhoto).toHaveBeenCalledWith(GPS_PHOTOS[0]);

    const map = leafletMocks.state.maps[0];
    const focusedMarker = leafletMocks.state.markers[1];
    rerender(<MapView onShowPhoto={onShowPhoto} focusedPhotoId={3} />);

    expect(leafletMocks.api.map).toHaveBeenCalledTimes(1);
    expect(map.setView).toHaveBeenLastCalledWith(
      { lat: GPS_PHOTOS[2].latitude, lng: GPS_PHOTOS[2].longitude },
      15,
    );
    expect(focusedMarker.openPopup).toHaveBeenCalledOnce();
    expect(focusedMarker.setIcon).toHaveBeenCalled();
  });

  it("offers retry when loading locations fails", async () => {
    serviceMocks.getPhotos
      .mockRejectedValueOnce(new Error("仓库暂时不可用"))
      .mockResolvedValueOnce([]);

    render(<MapView />);

    expect(
      await screen.findByRole("heading", { name: "无法加载照片位置" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await screen.findByRole("heading", { name: "暂无带位置信息的照片" });
    expect(serviceMocks.getPhotos).toHaveBeenCalledTimes(2);
  });
});
