import { AnimatePresence, motion } from "framer-motion";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Request = {
  title: string;
  message?: string;
  initialValue?: string;
  confirmLabel: string;
};
const DialogContext = createContext<
  (request: Request) => Promise<string | null>
>(async () => null);
export const useActionDialog = () => useContext(DialogContext);

export function ActionDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<
    (Request & { resolve: (value: string | null) => void }) | null
  >(null);
  const [input, setInput] = useState("");
  const close = (value: string | null) => {
    dialog?.resolve(value);
    setDialog(null);
  };
  const shell = document.querySelector(".app-shell");
  return (
    <DialogContext.Provider
      value={(request) =>
        new Promise((resolve) => {
          setInput(request.initialValue ?? "");
          setDialog({ ...request, resolve });
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onMouseDown={() => close(null)}
              >
                <motion.form
                  role="dialog"
                  aria-modal="true"
                  aria-label={dialog.title}
                  className="create-dialog action-dialog"
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.97 }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") close(null);
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    close(input.trim());
                  }}
                >
                  <h2>{dialog.title}</h2>
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
                      className="primary-button"
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
