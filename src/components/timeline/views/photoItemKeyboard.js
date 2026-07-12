export function handlePhotoItemKeyDown({
  event,
  photo,
  photos,
  index,
  onSelect,
  onOpen,
}) {
  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    onSelect?.(photo, event);
    return true;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    onOpen?.(photos, index);
    return true;
  }

  return false;
}
