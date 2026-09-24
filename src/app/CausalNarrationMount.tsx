import { useEffect, useState } from "react";
import type { RunIdentity } from "../sim/protocol";
import { CausalAnnouncementRegion } from "../ui/CausalAnnouncementRegion";
import {
  advanceCausalNarrationSession,
  causalEventStreamRevisionKey,
  causalRunIdentityKey,
  createCausalNarrationSession,
  type AuthoritativeCausalEventStream,
} from "./causalNarration";

export interface CausalNarrationMountProps {
  readonly activeRunIdentity: RunIdentity | null;
  readonly stream?: AuthoritativeCausalEventStream | null;
}

/**
 * Stable product-shell mount for bounded causal-event narration.
 *
 * The region is present from the first render and starts empty. Accepted
 * authoritative events update its text after mount, which is the reliable live
 * region pattern; missing or stale authority leaves the same region silent.
 */
export function CausalNarrationMount({
  activeRunIdentity,
  stream = null,
}: CausalNarrationMountProps) {
  const [session, setSession] = useState(createCausalNarrationSession);
  const activeRunKey =
    activeRunIdentity === null
      ? "none"
      : causalRunIdentityKey(activeRunIdentity);
  const streamRevision = causalEventStreamRevisionKey(stream);

  useEffect(() => {
    setSession((current) =>
      advanceCausalNarrationSession(
        current,
        activeRunIdentity,
        stream,
      ),
    );
    // The derived keys deliberately capture semantic authority changes rather
    // than depending on caller object identity.
  }, [activeRunKey, streamRevision]);

  return <CausalAnnouncementRegion plan={session.plan} />;
}
