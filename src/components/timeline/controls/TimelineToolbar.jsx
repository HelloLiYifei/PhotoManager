import { useEffect, useId } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "../../../i18n";
import ViewSwitcher from "../../shared/ViewSwitcher";
import { Select } from "../../ui";
import styles from "./TimelineToolbar.module.css";

function FilterFields({
  allTags,
  tagFilter,
  ratingFilter,
  onTagFilterChange,
  onRatingFilterChange,
  t,
}) {
  return (
    <div className={styles.filterFields}>
      <label className={styles.filterField}>
        <span>{t("timeline.tag")}</span>
        <Select
          wrapperClassName={styles.filterSelectRoot}
          className={styles.filterSelect}
          value={tagFilter}
          onChange={(value) => onTagFilterChange?.(value)}
          aria-label={t("timeline.filterTag")}
          options={[
            { value: "", label: t("timeline.allTags") },
            ...allTags.map((tag) => ({ value: tag, label: tag })),
          ]}
        />
      </label>

      <label className={styles.filterField}>
        <span>{t("timeline.rating")}</span>
        <Select
          wrapperClassName={styles.filterSelectRoot}
          className={styles.filterSelect}
          value={ratingFilter}
          onChange={(value) => onRatingFilterChange?.(Number(value))}
          aria-label={t("timeline.filterRating")}
          options={[
            { value: 0, label: t("timeline.allRatings") },
            { value: 1, label: t("timeline.ratingOne") },
            { value: 3, label: t("timeline.ratingThree") },
            { value: 5, label: t("timeline.ratingFive") },
          ]}
        />
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
  const { t } = useI18n();
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
    t,
  };

  return (
    <header className={styles.toolbar} aria-label={t("timeline.photoView")}>
      <label className={styles.searchField}>
        <span className={styles.visuallyHidden}>{t("timeline.search")}</span>
        <Search aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={t("timeline.searchPlaceholder")}
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
        aria-label={activeFilterCount ? t("timeline.activeFiltersLabel", { count: activeFilterCount }) : t("timeline.filterPhotos")}
        aria-expanded={filtersOpen}
        aria-controls={filtersId}
      >
        <SlidersHorizontal aria-hidden="true" />
        <span>{t("timeline.filter")}</span>
        {activeFilterCount ? <strong aria-hidden="true">{activeFilterCount}</strong> : null}
      </button>

      <ViewSwitcher
        value={viewMode}
        onChange={onViewModeChange}
        ariaLabel={t("timeline.photoView")}
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
                <h2 id={`${filtersId}-title`}>{t("timeline.filterPhotos")}</h2>
                <p>{activeFilterCount ? t("timeline.activeFilters", { count: activeFilterCount }) : t("timeline.narrowRange")}</p>
              </div>
              <button
                type="button"
                onClick={() => onFiltersOpenChange?.(false)}
                aria-label={t("timeline.closeFilters")}
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
