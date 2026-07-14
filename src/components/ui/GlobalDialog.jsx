import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  Info,
  MessageSquareText,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";

import Button from "./Button";
import { GlobalDialogContext } from "./globalDialogContext";
import useOverlayFocus from "./useOverlayFocus";
import styles from "./GlobalDialog.module.css";

const TONE_ICONS = {
  danger: XCircle,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
};

function DialogSurface({ request, onResolve }) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef(null);
  const [inputValue, setInputValue] = useState(request.defaultValue ?? "");
  const isPrompt = request.type === "prompt";
  const hasCancel = request.type !== "alert";
  const Icon = isPrompt ? MessageSquareText : TONE_ICONS[request.tone] || Info;

  const dismissValue = isPrompt ? null : false;
  const dismiss = useCallback(() => onResolve(dismissValue), [dismissValue, onResolve]);
  useOverlayFocus({ open: true, containerRef: panelRef, onClose: dismiss });

  const submit = (event) => {
    event.preventDefault();
    onResolve(isPrompt ? inputValue : true);
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <form
        ref={panelRef}
        className={styles.dialog}
        data-tone={request.tone}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        onSubmit={submit}
      >
        <div className={styles.accent} aria-hidden="true" />
        <header className={styles.header}>
          <span className={styles.icon} aria-hidden="true">
            <Icon />
          </span>
          <div className={styles.heading}>
            <span className={styles.kicker}>PhotoManager</span>
            <h2 id={titleId}>{request.title}</h2>
          </div>
          <Button
            className={styles.closeButton}
            variant="ghost"
            size="icon"
            aria-label="关闭弹窗"
            onClick={dismiss}
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className={styles.body}>
          <p id={messageId} className={styles.message}>{request.message}</p>
          {isPrompt ? (
            <label className={styles.inputField}>
              <span>{request.inputLabel}</span>
              <input
                autoFocus
                value={inputValue}
                placeholder={request.placeholder}
                onChange={(event) => setInputValue(event.target.value)}
              />
            </label>
          ) : null}
        </div>

        <footer className={styles.footer}>
          {hasCancel ? (
            <Button variant="secondary" onClick={dismiss}>
              {request.cancelText}
            </Button>
          ) : null}
          <Button
            autoFocus={!isPrompt}
            variant={request.tone === "danger" ? "danger" : "primary"}
            type="submit"
          >
            {request.confirmText}
          </Button>
        </footer>
      </form>
    </div>
  );
}

export function GlobalDialogProvider({ children }) {
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef(null);
  const pendingRequestsRef = useRef([]);
  const [activeRequest, setActiveRequest] = useState(null);

  const enqueue = useCallback((request) => new Promise((resolve) => {
    const queuedRequest = {
      id: ++requestIdRef.current,
      ...request,
      resolve,
    };

    if (activeRequestRef.current) {
      pendingRequestsRef.current.push(queuedRequest);
      return;
    }

    activeRequestRef.current = queuedRequest;
    setActiveRequest(queuedRequest);
  }), []);

  const resolveActive = useCallback((value) => {
    const current = activeRequestRef.current;
    if (!current) return;

    current.resolve(value);
    const next = pendingRequestsRef.current.shift() ?? null;
    activeRequestRef.current = next;
    setActiveRequest(next);
  }, []);

  useEffect(() => () => {
    const pending = [
      activeRequestRef.current,
      ...pendingRequestsRef.current,
    ].filter(Boolean);
    pending.forEach((request) => request.resolve(request.type === "prompt" ? null : false));
    activeRequestRef.current = null;
    pendingRequestsRef.current = [];
  }, []);

  const dialog = useMemo(() => ({
    alert: (message, options = {}) => enqueue({
      type: "alert",
      message: String(message),
      title: options.title ?? "操作提示",
      tone: options.tone ?? "info",
      confirmText: options.confirmText ?? "知道了",
      cancelText: "",
    }),
    confirm: (message, options = {}) => enqueue({
      type: "confirm",
      message: String(message),
      title: options.title ?? "请确认此操作",
      tone: options.tone ?? "warning",
      confirmText: options.confirmText ?? "确认",
      cancelText: options.cancelText ?? "取消",
    }),
    prompt: (message, options = {}) => enqueue({
      type: "prompt",
      message: String(message),
      title: options.title ?? "请输入内容",
      tone: options.tone ?? "info",
      confirmText: options.confirmText ?? "确定",
      cancelText: options.cancelText ?? "取消",
      defaultValue: options.defaultValue ?? "",
      inputLabel: options.inputLabel ?? "输入内容",
      placeholder: options.placeholder ?? "",
    }),
  }), [enqueue]);

  return (
    <GlobalDialogContext.Provider value={dialog}>
      {children}
      {activeRequest ? (
        <DialogSurface
          key={activeRequest.id}
          request={activeRequest}
          onResolve={resolveActive}
        />
      ) : null}
    </GlobalDialogContext.Provider>
  );
}
