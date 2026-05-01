import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { FPS, DEFAULT_TRACK_HEIGHT } from "./types";
import { Input } from "~/components/ui/input";

// --- Isolated Playhead Line (for TimelineTracks) ---
interface PlayheadLineProps {
  playerRef: React.RefObject<PlayerRef | null>;
  pixelsPerSecond: number;
  trackCount: number;
}

export const PlayheadLine: React.FC<PlayheadLineProps> = ({
  playerRef,
  pixelsPerSecond,
  trackCount,
}) => {
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      if (!lineRef.current) return;
      const timeInSeconds = e.detail.frame / FPS;
      const positionPx = timeInSeconds * pixelsPerSecond;
      lineRef.current.style.transform = `translateX(${positionPx}px)`;
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    
    // Set initial position
    const currentFrame = player.getCurrentFrame();
    if (currentFrame !== undefined) {
      handleFrameUpdate({ detail: { frame: currentFrame } });
    }

    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
    };
  }, [playerRef, pixelsPerSecond]);

  return (
    <div
      ref={lineRef}
      className="absolute top-0 w-0.5 bg-primary pointer-events-none z-40"
      style={{
        left: 0, // Base left is 0, we move it with transform for better performance
        height: `${Math.max(trackCount * DEFAULT_TRACK_HEIGHT, 200)}px`,
        willChange: "transform",
      }}
    />
  );
};

// --- Isolated Playhead Handle (for TimelineRuler) ---
interface PlayheadHandleProps {
  playerRef: React.RefObject<PlayerRef | null>;
  pixelsPerSecond: number;
  onMouseDown: (e: React.MouseEvent) => void;
}

export const PlayheadHandle: React.FC<PlayheadHandleProps> = ({
  playerRef,
  pixelsPerSecond,
  onMouseDown,
}) => {
  const handleRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      if (!handleRef.current || !lineRef.current) return;
      const timeInSeconds = e.detail.frame / FPS;
      const positionPx = timeInSeconds * pixelsPerSecond;
      
      handleRef.current.style.transform = `translateX(${positionPx - 4}px)`;
      lineRef.current.style.transform = `translateX(${positionPx}px)`;
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    
    // Set initial position
    const currentFrame = player.getCurrentFrame();
    if (currentFrame !== undefined) {
      handleFrameUpdate({ detail: { frame: currentFrame } });
    }

    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
    };
  }, [playerRef, pixelsPerSecond]);

  return (
    <>
      {/* Playhead line - contained within ruler */}
      <div
        ref={lineRef}
        className="absolute top-0 w-0.5 bg-primary pointer-events-none z-30 shadow-sm"
        style={{
          left: 0,
          height: "24px",
          willChange: "transform",
        }}
      />

      {/* Playhead handle - compact design */}
      <div
        ref={handleRef}
        className="absolute top-[2px] bg-primary cursor-grab hover:cursor-grabbing z-30 border border-background shadow-lg hover:shadow-xl transition-shadow"
        style={{
          left: 0,
          width: "8px",
          height: "8px",
          borderRadius: "1px",
          willChange: "transform",
        }}
        onMouseDown={onMouseDown}
        title="Drag to seek"
      />
    </>
  );
};

// --- Isolated Time Display (for TimelineRuler) ---
interface PlayheadTimeDisplayProps {
  playerRef: React.RefObject<PlayerRef | null>;
  pixelsPerSecond: number;
  timelineWidth: number;
  onSeek: (positionPx: number) => void;
}

export const PlayheadTimeDisplay: React.FC<PlayheadTimeDisplayProps> = ({
  playerRef,
  pixelsPerSecond,
  timelineWidth,
  onSeek,
}) => {
  const displayRef = useRef<HTMLDivElement>(null);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [timeInputValue, setTimeInputValue] = useState("");

  const formatTimestamp = (timeInSeconds: number) => {
    const totalMs = Math.max(0, Math.round(timeInSeconds * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const milliseconds = totalMs % 1000;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
  };

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      if (!displayRef.current || isEditingTime) return;
      const timeInSeconds = e.detail.frame / FPS;
      displayRef.current.textContent = formatTimestamp(timeInSeconds);
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    
    // Set initial position
    const currentFrame = player.getCurrentFrame();
    if (currentFrame !== undefined) {
      handleFrameUpdate({ detail: { frame: currentFrame } });
    }

    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
    };
  }, [playerRef, isEditingTime]);

  // Handle time input submission with improved parsing
  const handleTimeInputSubmit = () => {
    const timeString = timeInputValue.trim();
    if (!timeString) {
      setIsEditingTime(false);
      return;
    }

    let totalSeconds = 0;
    try {
      if (timeString.includes(":")) {
        const [minutes, secondsAndMs] = timeString.split(":");
        if (secondsAndMs.includes(".")) {
          const [seconds, ms] = secondsAndMs.split(".");
          totalSeconds = parseInt(minutes) * 60 + parseInt(seconds) + parseFloat(`0.${ms}`);
        } else {
          totalSeconds = parseInt(minutes) * 60 + parseInt(secondsAndMs);
        }
      } else if (timeString.includes(".")) {
        totalSeconds = parseFloat(timeString);
      } else if (timeString.endsWith("f") || timeString.endsWith("F")) {
        const frameNum = parseInt(timeString.slice(0, -1));
        totalSeconds = frameNum / FPS;
      } else {
        totalSeconds = parseFloat(timeString);
      }

      const newPositionPx = totalSeconds * pixelsPerSecond;
      onSeek(Math.max(0, Math.min(newPositionPx, timelineWidth)));
    } catch (error) {
      console.warn("Invalid time format:", timeString);
    }

    setIsEditingTime(false);
    setTimeInputValue("");
  };

  const handleTimeInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTimeInputSubmit();
    } else if (e.key === "Escape") {
      setIsEditingTime(false);
      setTimeInputValue("");
    }
  };

  return (
    <div className="w-28 bg-muted/70 border-r border-border/50 flex-shrink-0 flex flex-col items-center justify-center py-1 px-2">
      {isEditingTime ? (
        <Input
          value={timeInputValue}
          onChange={(e) => setTimeInputValue(e.target.value)}
          onBlur={handleTimeInputSubmit}
          onKeyDown={handleTimeInputKeyDown}
          placeholder="00:00:00.000"
          className="h-3 text-xs font-mono w-full px-1 py-0 text-center border-0 bg-transparent focus:bg-muted/50 transition-colors"
          autoFocus
        />
      ) : (
        <div
          ref={displayRef}
          className="w-full text-xs font-mono text-foreground font-medium leading-none cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded transition-colors whitespace-nowrap overflow-hidden text-center"
          onClick={() => {
            setIsEditingTime(true);
            const player = playerRef.current;
            const currentFrame = player ? player.getCurrentFrame() : 0;
            setTimeInputValue(formatTimestamp(currentFrame / FPS));
          }}
          title="Click to edit time (supports mm:ss.ms, ss.ms, 120f formats)">
          00:00:00.000
        </div>
      )}
    </div>
  );
};
