import { useEffect, useId } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import ViewSwitcher from "../../shared/ViewSwitcher";
import styles from "./TimelineToolbar.module.css";

function FilterFields({
  allTags,
  tagFilter,
  ratingFilter,
  onTagFilterChange,
  onRatingFilterChange,
}) {
  return (
    <div className={styles.filterFields}>
      <label className={styles.filterField}>
        <span>标签</span>
        <select
          value={tagFilter}
          onChange={(event) => onTagFilterChange?.(event.target.value)}
          aria-label="按标签筛选"
        >
          <option value="">全部标签</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </label>

      <label className={styles.filterField}>
        <span>评分</span>
        <select
          value={ratingFilter}
          onChange={(event) => onRatingFilterChange?.(Number(event.target.value))}
          aria-label="按评分筛选"
        >
          <option value={0}>全部评分</option>
          <option value={1}>1 星及以上</option>
          <option value={3}>3 星及以上</option>
          <option value={5}>仅 5 星</option>
        </select>
      </label>
    </div>
  );
}

export default function TimelineToolbar({
  searchQuery = "",
  onSearchChange,
  allTags = [],
  tagFilter = "",
  onTagFilterChange,
  ratingFilter = 0,
  onRatingFilterChange,
  viewMode = "masonry",
  onViewModeChange,
  filtersOpen = false,
  onFiltersOpenChange,
}) {
  const filtersId = useId();
  const activeFilterCount = Number(Boolean(tagFilter)) + Number(Number(ratingFilter) > 0);

  useEffect(() => {
    if (!filtersOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onFiltersOpenChange?.(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filtersOpen, onFiltersOpenChange]);

  const filterProps = {
    allTags,
    tagFilter,
    ratingFilter,
    onTagFilterChange,
    onRatingFilterChange,
  };

  return (
    <header className={styles.toolbar} aria-label="照片浏览工具栏">
      <label className={styles.searchField}>
        <span className={styles.visuallyHidden}>搜索照片</span>
        <Search aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="搜索文件名、相机或参数…"
          autoComplete="off"
        />
      </label>

      <div className={styles.desktopFilters}>
        <FilterFields {...filterProps} />
      </div>

      <button
        className={styles.mobileFilterButton}
        type="button"
        onClick={() => onFiltersOpenChange?.(!filtersOpen)}
        aria-label={activeFilterCount ? `筛选，已启用 ${activeFilterCount} 项` : "筛选照片"}
        aria-expanded={filtersOpen}
        aria-controls={filtersId}
      >
        <SlidersHorizontal aria-hidden="true" />
        <span>筛选</span>
        {activeFilterCount ? <strong aria-hidden="true">{activeFilterCount}</strong> : null}
      </button>

      <ViewSwitcher
        value={viewMode}
        onChange={onViewModeChange}
        ariaLabel="照片视图"
      />

      {filtersOpen ? (
        <div
          className={styles.mobileFilterBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onFiltersOpenChange?.(false);
          }}
        >
          <section
            className={styles.mobileFilterPanel}
            id={filtersId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${filtersId}-title`}
          >
            <header>
              <div>
                <h2 id={`${filtersId}-title`}>筛选照片</h2>
                <p>{activeFilterCount ? `已启用 ${activeFilterCount} 项筛选` : "缩小当前照片范围"}</p>
              </div>
              <button
                type="button"
                onClick={() => onFiltersOpenChange?.(false)}
                aria-label="关闭筛选面板"
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <FilterFields {...filterProps} />
          </section>
        </div>
      ) : null}
    </header>
  );
}
