import { WifiOff } from "lucide-react";
import styles from "../MapView.module.css";

export default function MapStatusBanner() {
  return (
    <div className={styles.networkWarning} role="status" aria-live="polite">
      <WifiOff aria-hidden="true" />
      <span>地图底图暂时无法连接；照片位置标记仍可使用。</span>
    </div>
  );
}
