import { useId } from "react";
import { Modal } from "./Modal";
import { DangerButton, SecondaryButton } from "./controls";

/** Two-step destructive confirmation shared by remove/untrack actions. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  return (
    <Modal open={open} onClose={onCancel} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <SecondaryButton onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        <DangerButton onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </DangerButton>
      </div>
    </Modal>
  );
}
