import { useRef } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { WhiteboardColorPicker } from './WhiteboardColorPicker';
import { WhiteboardToolbarGroup } from './WhiteboardToolbarPrimitives';

interface WhiteboardSelectionColorChoiceProps {
  color: string;
  onCancel: () => void;
  onChange: (color: string) => void;
  onPreviewChange: (color: string) => void;
  onClose: () => void;
  onOpen: () => void;
}

export function WhiteboardSelectionColorChoice({
  color,
  onCancel,
  onChange,
  onPreviewChange,
  onClose,
  onOpen,
}: WhiteboardSelectionColorChoiceProps) {
  const appliedRef = useRef(false);
  const handleOpen = () => {
    appliedRef.current = false;
    onOpen();
  };
  const handleClose = () => {
    if (!appliedRef.current) onCancel();
    appliedRef.current = false;
    onClose();
  };

  return (
    <div data-whiteboard-selection-color-control="true">
      <WhiteboardToolbarGroup>
        <WhiteboardColorPicker
          color={color}
          swatches={themeWhiteboardTokens.colorPickerSwatches}
          onChange={(nextColor) => { appliedRef.current = true; onChange(nextColor); }}
          onPreviewChange={onPreviewChange}
          onClose={handleClose}
          onOpen={handleOpen}
        />
      </WhiteboardToolbarGroup>
    </div>
  );
}
