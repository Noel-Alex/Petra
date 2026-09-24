import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactElement,
} from "react";

import {
  beginActionKeyboardPress,
  beginActionPointerPress,
  clearActionKeyboardPress,
  clearActionPointerState,
  finishActionKeyboardPress,
  createActionInteractionState,
  resolveActionMicroInteractionState,
  updateActionInteractionState,
} from "./motion/actionInteraction";
import { resolveMicroInteraction } from "./motion/microInteractions";
import type { MotionPreference } from "./motion/policy";

import "./petraCompactAction.css";

export interface PetraCompactActionProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly selected?: boolean;
  readonly motionPreference: MotionPreference;
}

/**
 * Compact native-button adapter for Petra's shared semantic micro-interactions.
 * Presentation only: callers retain command/science authority.
 */
export function PetraCompactAction({
  selected,
  motionPreference,
  disabled,
  className,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  children,
  ...buttonProps
}: PetraCompactActionProps): ReactElement {
  const [interaction, setInteraction] = useState(createActionInteractionState);

  useEffect(() => {
    if (!disabled) return;
    setInteraction((current) =>
      clearActionKeyboardPress(clearActionPointerState(current)),
    );
  }, [disabled]);

  const isSelected = selected === true;
  const semanticState = resolveActionMicroInteractionState({
    interaction,
    disabled: disabled === true,
    selected: isSelected,
  });
  const presentation = resolveMicroInteraction(semanticState, motionPreference);

  const style = {
    ...buttonProps.style,
    "--petra-compact-action-duration": `${presentation.durationMs}ms`,
    "--petra-compact-action-easing": `cubic-bezier(${presentation.easing.join(", ")})`,
    "--petra-compact-action-y": `${presentation.translateYRem}rem`,
    "--petra-compact-action-scale": presentation.scale,
  } as CSSProperties;

  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      disabled={disabled}
      className={["petra-compact-action", className].filter(Boolean).join(" ")}
      data-emphasis={presentation.emphasis}
      data-motion={motionPreference}
      aria-pressed={selected === undefined ? buttonProps["aria-pressed"] : selected}
      style={style}
      onPointerEnter={(event) => {
        if (!disabled) {
          setInteraction((current) =>
            updateActionInteractionState(current, "pointer-enter"),
          );
        }
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setInteraction((current) =>
          updateActionInteractionState(current, "pointer-leave"),
        );
        onPointerLeave?.(event);
      }}
      onPointerDown={(event) => {
        if (!disabled) {
          const button = event.button;
          setInteraction((current) => beginActionPointerPress(current, button));
        }
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setInteraction((current) =>
          updateActionInteractionState(current, "pointer-up"),
        );
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        setInteraction((current) =>
          updateActionInteractionState(current, "pointer-cancel"),
        );
        onPointerCancel?.(event);
      }}
      onFocus={(event) => {
        if (!disabled) {
          setInteraction((current) =>
            updateActionInteractionState(current, "focus"),
          );
        }
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setInteraction((current) =>
          updateActionInteractionState(current, "blur"),
        );
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!disabled && !event.defaultPrevented) {
          const key = event.key;
          setInteraction((current) =>
            beginActionKeyboardPress(current, key, false),
          );
        }
      }}
      onKeyUp={(event) => {
        const key = event.key;
        setInteraction((current) => finishActionKeyboardPress(current, key));
        onKeyUp?.(event);
      }}
    >
      {children}
    </button>
  );
}
