import { useCallback, useEffect, useRef, useState } from "react";

import {
  addTagToPhoto,
  getAllTags,
  getPhotoTags,
  removeTagFromPhoto,
} from "../../../services/photoService";

export default function usePhotoMetadata(primaryPhotoId) {
  const [allTags, setAllTags] = useState([]);
  const [primaryTags, setPrimaryTags] = useState([]);
  const allTagsRequestRef = useRef(0);
  const photoTagsRequestRef = useRef(0);

  const reloadAllTags = useCallback(async () => {
    const requestId = ++allTagsRequestRef.current;
    try {
      const tags = await getAllTags();
      if (requestId === allTagsRequestRef.current) setAllTags(tags);
      return tags;
    } catch (error) {
      if (requestId === allTagsRequestRef.current) {
        console.error("Failed to load tags", error);
      }
      return [];
    }
  }, []);

  const reloadPrimaryTags = useCallback(async (photoId = primaryPhotoId) => {
    const requestId = ++photoTagsRequestRef.current;
    if (!photoId) {
      setPrimaryTags([]);
      return [];
    }

    try {
      const tags = await getPhotoTags({ photoId });
      if (requestId === photoTagsRequestRef.current) setPrimaryTags(tags);
      return tags;
    } catch (error) {
      if (requestId === photoTagsRequestRef.current) {
        console.error("Failed to load photo tags", error);
      }
      return [];
    }
  }, [primaryPhotoId]);

  useEffect(() => {
    reloadAllTags();
    return () => {
      allTagsRequestRef.current += 1;
    };
  }, [reloadAllTags]);

  useEffect(() => {
    reloadPrimaryTags(primaryPhotoId);
    return () => {
      photoTagsRequestRef.current += 1;
    };
  }, [primaryPhotoId, reloadPrimaryTags]);

  const addPrimaryTag = useCallback(async (tagName) => {
    const normalized = tagName.trim();
    if (!primaryPhotoId || !normalized) return false;
    await addTagToPhoto({ photoId: primaryPhotoId, tagName: normalized });
    await Promise.all([reloadPrimaryTags(primaryPhotoId), reloadAllTags()]);
    return true;
  }, [primaryPhotoId, reloadAllTags, reloadPrimaryTags]);

  const removePrimaryTag = useCallback(async (tagName) => {
    if (!primaryPhotoId) return false;
    await removeTagFromPhoto({ photoId: primaryPhotoId, tagName });
    await Promise.all([reloadPrimaryTags(primaryPhotoId), reloadAllTags()]);
    return true;
  }, [primaryPhotoId, reloadAllTags, reloadPrimaryTags]);

  return {
    addPrimaryTag,
    allTags,
    primaryTags,
    reloadAllTags,
    reloadPrimaryTags,
    removePrimaryTag,
  };
}
