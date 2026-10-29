'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { uiStore, useUIStore } from '@/lib/client/ui-store';
import { GripVertical } from 'lucide-react';

interface ResizeHandleProps {
  sidebarWidth?: number; // width of sidebar to calculate offset
}

export function ResizeHandle({ sidebarWidth = 260 }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);

  const startDragging = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        // Calculate new timeline width: pointer X minus sidebar width
        const newWidth = moveEvent.clientX - sidebarWidth;
        uiStore.setTimelineWidth(newWidth);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [sidebarWidth]
  );

  return (
    <div
      ref={handleRef}
      onPointerDown={startDragging}
      onDoubleClick={() => {
        uiStore.setTimelineWidth(360);
        uiStore.showToast('Reset timeline width to 360px');
      }}
      title="Drag to resize reading pane, double-click to reset"
      className={`group relative z-30 hidden md:flex items-center justify-center w-2.5 -ml-1.5 cursor-col-resize select-none shrink-0 transition-colors ${
        isDragging ? 'bg-reader-accent/20' : 'hover:bg-reader-accent/10'
      }`}
    >
      {/* Visual divider line */}
      <div
        className={`w-0.5 h-full transition-colors ${
          isDragging
            ? 'bg-reader-accent'
            : 'bg-reader-border group-hover:bg-reader-accent'
        }`}
      />

      {/* Center grip handle indicator */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 rounded-full border border-reader-border bg-reader-surface shadow-sm flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 ${
          isDragging ? 'opacity-100 border-reader-accent text-reader-accent' : 'text-reader-dim'
        }`}
      >
        <GripVertical className="w-3 h-3" />
      </div>
    </div>
  );
}

