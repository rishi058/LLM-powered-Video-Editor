import React, { useCallback, useMemo } from "react";
import { useCurrentScale, Sequence } from "remotion";
import {
  FPS,
  PIXELS_PER_SECOND,
  type ScrubberState,
  type TimelineState,
  type TrackState,
} from "./types";

const HANDLE_SIZE = 10;

export const ResizeHandle: React.FC<{
  type: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  setItem: (updatedScrubber: ScrubberState) => void;
  ScrubberState: ScrubberState;
}> = ({ type, setItem, ScrubberState }) => {
  const scale = useCurrentScale();
  const size = Math.round(HANDLE_SIZE / scale);
  const borderSize = 1 / scale;
  const newScrubberStateRef = React.useRef<ScrubberState>(ScrubberState);

  const sizeStyle: React.CSSProperties = useMemo(() => ({
    position: "absolute",
    height: size,
    width: size,
    backgroundColor: "white",
    border: `${borderSize}px solid rgb(59, 130, 246)`,
    borderRadius: "2px",
  }), [borderSize, size]);

  const margin = -size / 2 - borderSize;

  const style: React.CSSProperties = useMemo(() => {
    if (type === "top-left") return { ...sizeStyle, marginLeft: margin, marginTop: margin, cursor: "nwse-resize" };
    if (type === "top-right") return { ...sizeStyle, marginTop: margin, marginRight: margin, right: 0, cursor: "nesw-resize" };
    if (type === "bottom-left") return { ...sizeStyle, marginBottom: margin, marginLeft: margin, bottom: 0, cursor: "nesw-resize" };
    if (type === "bottom-right") return { ...sizeStyle, marginBottom: margin, marginRight: margin, right: 0, bottom: 0, cursor: "nwse-resize" };
    throw new Error("Unknown type: " + JSON.stringify(type));
  }, [margin, sizeStyle, type]);

  const onPointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;

      const initialX = e.clientX;
      const initialY = e.clientY;

      const onPointerMove = (pointerMoveEvent: PointerEvent) => {
        const offsetX = (pointerMoveEvent.clientX - initialX) / scale;
        const offsetY = (pointerMoveEvent.clientY - initialY) / scale;
        const isLeft = type === "top-left" || type === "bottom-left";
        const isTop = type === "top-left" || type === "top-right";
        newScrubberStateRef.current = {
          ...ScrubberState,
          width_player: Math.max(1, Math.round(ScrubberState.width_player + (isLeft ? -offsetX : offsetX))),
          height_player: Math.max(1, Math.round(ScrubberState.height_player + (isTop ? -offsetY : offsetY))),
          left_player: Math.round(ScrubberState.left_player + (isLeft ? offsetX : 0)),
          top_player: Math.round(ScrubberState.top_player + (isTop ? offsetY : 0)),
          is_dragging: true,
        };
        setItem(newScrubberStateRef.current);
      };

      const onPointerUp = () => {
        setItem({ ...newScrubberStateRef.current, is_dragging: false });
        window.removeEventListener("pointermove", onPointerMove);
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [ScrubberState, scale, setItem, type]
  );

  return <div onPointerDown={onPointerDown} style={style} />;
};

export const SelectionOutline: React.FC<{
  ScrubberState: ScrubberState;
  changeItem: (updatedScrubber: ScrubberState) => void;
  setSelectedItem: React.Dispatch<React.SetStateAction<string | null>>;
  selectedItem: string | null;
  isDragging: boolean;
}> = ({ ScrubberState, changeItem, setSelectedItem, selectedItem, isDragging }) => {
  const scale = useCurrentScale();
  const scaledBorder = Math.ceil(2 / scale);
  const newScrubberStateRef = React.useRef<ScrubberState>(ScrubberState);
  const [hovered, setHovered] = React.useState(false);
  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => setHovered(false), []);
  const isSelected = ScrubberState.id === selectedItem;

  const style: React.CSSProperties = useMemo(() => ({
    width: ScrubberState.width_player,
    height: ScrubberState.height_player,
    left: ScrubberState.left_player,
    top: ScrubberState.top_player,
    position: "absolute",
    outline: isSelected ? `${scaledBorder}px solid rgb(59, 130, 246)` : undefined,
    userSelect: "none",
    touchAction: "none",
    cursor: isSelected ? "move" : hovered ? "pointer" : "default",
  }), [ScrubberState, hovered, isSelected, scaledBorder]);

  const startDragging = useCallback(
    (e: PointerEvent | React.MouseEvent) => {
      const initialX = e.clientX;
      const initialY = e.clientY;
      const onPointerMove = (pointerMoveEvent: PointerEvent) => {
        const offsetX = (pointerMoveEvent.clientX - initialX) / scale;
        const offsetY = (pointerMoveEvent.clientY - initialY) / scale;
        newScrubberStateRef.current = {
          ...ScrubberState,
          left_player: Math.round(ScrubberState.left_player + offsetX),
          top_player: Math.round(ScrubberState.top_player + offsetY),
          is_dragging: true,
        };
        changeItem(newScrubberStateRef.current);
      };
      const onPointerUp = () => {
        changeItem({ ...newScrubberStateRef.current, is_dragging: false });
        window.removeEventListener("pointermove", onPointerMove);
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [ScrubberState, scale, changeItem]
  );

  const onPointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      setSelectedItem(ScrubberState.id);
      if (isSelected) startDragging(e);
    },
    [ScrubberState.id, setSelectedItem, startDragging, isSelected]
  );

  return (
    <div onPointerDown={onPointerDown} onPointerEnter={onMouseEnter} onPointerLeave={onMouseLeave} style={style}>
      {isSelected ? (
        <>
          <ResizeHandle ScrubberState={ScrubberState} setItem={changeItem} type="top-left" />
          <ResizeHandle ScrubberState={ScrubberState} setItem={changeItem} type="top-right" />
          <ResizeHandle ScrubberState={ScrubberState} setItem={changeItem} type="bottom-left" />
          <ResizeHandle ScrubberState={ScrubberState} setItem={changeItem} type="bottom-right" />
        </>
      ) : null}
    </div>
  );
};

export const layerContainer: React.CSSProperties = { overflow: "hidden" };
export const outer: React.CSSProperties = { backgroundColor: "#000000" };

export const SortedOutlines: React.FC<{
  timeline: TimelineState;
  selectedItem: string | null;
  setSelectedItem: React.Dispatch<React.SetStateAction<string | null>>;
  handleUpdateScrubber: (updateScrubber: ScrubberState) => void;
}> = ({ timeline, selectedItem, setSelectedItem, handleUpdateScrubber }) => {
  const allScrubbers = timeline.tracks.flatMap((track: TrackState) => track.scrubbers);
  const selected = allScrubbers.filter((s) => s.id === selectedItem);
  const unselected = allScrubbers.filter((s) => s.id !== selectedItem);
  const itemsToDisplay = [...unselected, ...selected];

  const isDragging = allScrubbers.some((s) => s.is_dragging);

  return (
    <>
      {itemsToDisplay.map((s) => (
        <Sequence
          key={s.id}
          from={Math.round((s.left / PIXELS_PER_SECOND) * FPS)}
          durationInFrames={Math.round((s.width / PIXELS_PER_SECOND) * FPS)}
          layout="none"
        >
          <SelectionOutline
            changeItem={handleUpdateScrubber}
            ScrubberState={s}
            setSelectedItem={setSelectedItem}
            selectedItem={selectedItem}
            isDragging={isDragging}
          />
        </Sequence>
      ))}
    </>
  );
};
