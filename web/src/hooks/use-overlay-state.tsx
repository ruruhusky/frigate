import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function useOverlayState(
  key: string,
): [string | undefined, (value: string) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const currentLocationState = location.state;

  const setOverlayStateValue = useCallback(
    (value: string) => {
      const newLocationState = { ...currentLocationState };
      newLocationState[key] = value;
      navigate(location.pathname, { state: newLocationState });
    },
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, navigate],
  );

  const overlayStateValue = useMemo<string | undefined>(
    () => location.state && location.state[key],
    [location, key],
  );

  return [overlayStateValue, setOverlayStateValue];
}
