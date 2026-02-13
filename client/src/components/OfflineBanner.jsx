import useOnlineStatus from "../hooks/useOnlineStatus";

export default function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-yellow-500 text-white text-sm text-center py-2 z-50">
      You’re offline. Some actions are disabled.
    </div>
  );
}
