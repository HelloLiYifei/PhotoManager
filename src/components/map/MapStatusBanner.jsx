import { WifiOff } from "lucide-react";
import { useI18n } from "../../i18n";
import { mapViewStyles as styles } from "../../themes/classNames";

export default function MapStatusBanner() {
  const { t } = useI18n();
  return (
    <div className={styles.networkWarning} role="status" aria-live="polite">
      <WifiOff aria-hidden="true" />
      <span>{t("map.tilesUnavailable")}</span>
    </div>
  );
}
