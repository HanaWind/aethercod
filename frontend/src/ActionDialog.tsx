import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert } from "lucide-react";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { glassFade, glassSlide } from "./glassMotion";

type Request = {
  title: string;
  message?: string;
  initialValue?: string;
  confirmLabel: string;
  danger?: boolean;
};
const DialogContext = createContext<
  (request: Request) => Promise<string | null>
>(async () => null);
export const useActionDialog = () => useContext(DialogContext);

export function ActionDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<
    (Request & { resolve: (value: string | null) => void }) | null
  >(null);
  const pendingDialog = useRef<typeof dialog>(null);
  const [input, setInput] = useState("");
  const close = (value: string | null) => {
    if (dialog !== pendingDialog.current) return;
    pendingDialog.current = null;
    dialog?.resolve(value);
    setDialog(null);
  };
  const shell = document.querySelector(".app-shell");
  return (
    <DialogContext.Provider
      value={(request) =>
        new Promise((resolve) => {
          pendingDialog.current?.resolve(null);
          const next = { ...request, resolve };
          pendingDialog.current = next;
          setInput(request.initialValue ?? "");
          setDialog(next);
        })
      }
    >
      {children}
      {shell &&
        createPortal(
          <AnimatePresence>
            {dialog && (
              <motion.div
                className="modal-scrim"
                {...glassFade}
                onMouseDown={() => close(null)}
              >
                <motion.form
                  role="dialog"
                  aria-modal="true"
                  aria-label={dialog.title}
                  className="create-dialog action-dialog"
                  {...glassSlide(8)}
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") close(null);
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    close(input.trim());
                  }}
                >
                  <h2 className={dialog.danger ? "danger-dialog-title" : ""}>
                    {dialog.danger && <CircleAlert size={19} />}
                    {dialog.title}
                  </h2>
                  {dialog.message && <p>{dialog.message}</p>}
                  {dialog.initialValue !== undefined && (
                    <input
                      aria-label={dialog.title}
                      value={input}
                      required
                      autoFocus
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setInput(event.target.value)}
                    />
                  )}
                  <div className="dialog-actions">
                    <button
                      autoFocus={dialog.initialValue === undefined}
                      className="secondary-button"
                      type="button"
                      onClick={() => close(null)}
                    >
                      取消
                    </button>
                    <button
                      className={`primary-button ${dialog.danger ? "danger-button" : ""}`}
                      type="submit"
                      disabled={
                        dialog.initialValue !== undefined && !input.trim()
                      }
                    >
                      {dialog.confirmLabel}
                    </button>
                  </div>
                </motion.form>
              </motion.div>
            )}
          </AnimatePresence>,
          shell,
        )}
    </DialogContext.Provider>
  );
}
