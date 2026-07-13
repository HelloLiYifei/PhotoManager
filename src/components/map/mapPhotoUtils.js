export function hasValidCoordinates(photo) {
  return (
    Number.isFinite(photo.latitude) &&
    Number.isFinite(photo.longitude) &&
    photo.latitude >= -90 &&
    photo.latitude <= 90 &&
    photo.longitude >= -180 &&
    photo.longitude <= 180
  );
}

export function groupPhotosByLocation(photos) {
  const groups = new Map();

  photos.forEach((photo) => {
    // Six decimal places keeps identical capture positions together while
    // retaining roughly decimetre-level coordinate precision.
    const key = `${photo.latitude.toFixed(6)},${photo.longitude.toFixed(6)}`;
    const group = groups.get(key);

    if (group) {
      group.photos.push(photo);
      return;
    }

    groups.set(key, {
      latitude: photo.latitude,
      longitude: photo.longitude,
      photos: [photo],
    });
  });

  return [...groups.values()];
}
