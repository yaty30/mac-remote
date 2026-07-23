import { RemoteControlMaster } from "../features/remote/RemoteControlMaster";

interface RemoteScreenProps {
  onLogout?: () => void;
  showInitialSplash?: boolean;
}

export function RemoteScreen({
  onLogout,
  showInitialSplash,
}: RemoteScreenProps) {
  return (
    <RemoteControlMaster
      onLogout={onLogout}
      showInitialSplash={showInitialSplash}
    />
  );
}
