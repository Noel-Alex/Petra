import {
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

import type { MotionPreference } from "./motion/policy";
import { resolveMicroInteraction } from "./motion/microInteractions";
import {
  createActionInteractionState,
  resolveActionMicroInteractionState,
  updateActionInteractionState,
} from "./motion/actionInteraction";
import { PetraIcon } from "./icons/PetraIcon";
import type { PetraIconName } from "./icons/spec";

import "./petraAction.css";

export interface PetraActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  readonly icon: PetraIconName;
  readonly label: string;
  readonly detail?: string;
  readonly selected?: boolean;
  readonly motionPreference: MotionPreference;
  readonly trailing?: ReactNode;
}

/**
 * Reusable action surface for intervention/tools/navigation controls.
 * It owns only presentation state; callers retain command/science authority.
 */
export function PetraAction({
  icon,
  label,
  detail,
  selected = false,
  motionPreference,
  trailing,
  disabled,
  className,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onFocus,
  onBlur,
  ...buttonProps
}: PetraActionProps): ReactElement {
  const [interaction, setInteraction] = useState(createActionInteractionState);

  const semanticState = resolveActionMicroInteractionState({
    interaction,
    disabled: disabled === true,
    selected,
  });

  const presentation = resolveMicroInteraction(semanticState, motionPreference);
  const style = {
    "--petra-action-duration": `${presentation.durationMs}ms`,
    "--petra-action-easing": `cubic-bezier(${presentation.easing.join(", ")})`,
    "--petra-action-y": `${presentation.translateYRem}rem`,
    "--petra-action-scale": presentation.scale,
  } as CSSProperties;

  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      disabled={disabled}
      className={["petra-action", className].filter(Boolean).join(" ")}
      data-emphasis={presentation.emphasis}
      data-motion={motionPreference}
      aria-pressed={selected ? true : undefined}
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
    >
      <span className="petra-action__icon" aria-hidden="true">
        <PetraIcon name={icon} decorative size={21} />
      </span>
      <span className="petra-action__copy">
        <strong>{label}</strong>
        {detail === undefined ? null : <span>{detail}</span>}
      </span>
      {trailing === undefined ? null : <span className="petra-action__trailing">{trailing}</span>}
    </button>
  );
}
