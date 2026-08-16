import { useEffect, useRef, useState } from 'react';
import { isEditableTarget } from '@/components/Whiteboard/model/interaction/whiteboardInteractions';

export function useWhiteboardSpacePan(active: boolean) {
  const spacePressedRef = useRef(false);
  const [spacePressed, setSpacePressed] = useState(false);

  useEffect(() => {
    if (!active) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return;
      event.preventDefault();
      spacePressedRef.current = true;
      setSpacePressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      releaseSpace();
    };
    const releaseSpace = () => {
      spacePressedRef.current = false;
      setSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseSpace);
    return () => {
      releaseSpace();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseSpace);
    };
  }, [active]);

  return { spacePressed, spacePressedRef };
}
