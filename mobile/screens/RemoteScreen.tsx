import { RemoteControlMaster } from "../features/remote/RemoteControlMaster";

interface RemoteScreenProps {
  showInitialSplash?: boolean;
}

export function RemoteScreen({ showInitialSplash }: RemoteScreenProps) {
  return <RemoteControlMaster showInitialSplash={showInitialSplash} />;
}
