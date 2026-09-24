import {
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactElement,
} from "react";

import {
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
  selected = false,
  motionPreference,
  disabled,
  className,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onPointerUp,
  onFocus,
  onBlur,
  ...buttonProps
}: PetraCompactActionProps): ReactElement {
  const [interaction, setInteraction] = useState(createActionInteractionState);

  const semanticState = resolveActionMicroInteractionState({
    interaction,
    disabled: disabled === true,
    selected,
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
      aria-pressed={selected ? true : buttonProps["aria-pressed"]}
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
          setInteraction((current) =>
            updateActionInteractionState(current, "pointer-down"),
          );
        }
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        if (!disabled) {
          setInteraction((current) =>
            updateActionInteractionState(current, "pointer-up"),
          );
        }
        onPointerUp?.(event);
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
    />
  );
}
