export interface RemoteKeyboardHandle {
  close: () => void;
  isVisible: () => boolean;
  open: () => void;
  toggle: () => void;
}

export interface KeyboardSelection {
  start: number;
  end: number;
}

export type KeyboardSendMode = "type" | "newLine" | "paste";
