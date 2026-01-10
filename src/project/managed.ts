import {
  CODE_ASSIST_HEADERS,
  GEMINI_CODE_ASSIST_ENDPOINT,
} from "../constants";
import { getAuth, updateManagedProject } from "../db/sqlite";

const projectContextResultCache = new Map<string, string>();
const projectContextPendingCache = new Map<string, Promise<string>>();

const CODE_ASSIST_METADATA = {
  ideType: "IDE_UNSPECIFIED",
  platform: "PLATFORM_UNSPECIFIED",
  pluginType: "GEMINI",
} as const;

interface GeminiUserTier {
  id?: string;
  isDefault?: boolean;
  userDefinedCloudaicompanionProject?: boolean;
}

interface LoadCodeAssistPayload {
  cloudaicompanionProject?: string;
  currentTier?: {
    id?: string;
  };
  allowedTiers?: GeminiUserTier[];
}

interface OnboardUserPayload {
  done?: boolean;
  response?: {
    cloudaicompanionProject?: {
      id?: string;
    };
  };
}

/**
 * Builds metadata headers required by the Code Assist API.
 */
function buildMetadata(projectId?: string): Record<string, string> {
  const metadata: Record<string, string> = {
    ideType: CODE_ASSIST_METADATA.ideType,
    platform: CODE_ASSIST_METADATA.platform,
    pluginType: CODE_ASSIST_METADATA.pluginType,
  };
  if (projectId) {
    metadata.duetProject = projectId;
  }
  return metadata;
}

/**
 * Selects the default tier ID from the allowed tiers list.
 */
function getDefaultTierId(allowedTiers?: GeminiUserTier[]): string | undefined {
  if (!allowedTiers || allowedTiers.length === 0) {
    return undefined;
  }
  for (const tier of allowedTiers) {
    if (tier?.isDefault) {
      return tier.id;
    }
  }
  return allowedTiers[0]?.id;
}

/**
 * Promise-based delay utility.
 */
function wait(ms: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Clears cached project context results and pending promises.
 */
export function invalidateProjectContextCache(): void {
  projectContextPendingCache.clear();
  projectContextResultCache.clear();
}

/**
 * Loads managed project information for the given access token.
 */
export async function loadManagedProject(
  accessToken: string,
  projectId?: string
): Promise<LoadCodeAssistPayload | null> {
  try {
    const metadata = buildMetadata(projectId);

    const requestBody: Record<string, unknown> = { metadata };
    if (projectId) {
      requestBody.cloudaicompanionProject = projectId;
    }

    const response = await fetch(
      `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...CODE_ASSIST_HEADERS,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as LoadCodeAssistPayload;
  } catch (error) {
    console.error("Failed to load Gemini managed project:", error);
    return null;
  }
}

/**
 * Onboards a managed project for the user, optionally retrying until completion.
 */
export async function onboardManagedProject(
  accessToken: string,
  tierId: string,
  projectId?: string,
  attempts = 10,
  delayMs = 5000
): Promise<string | undefined> {
  const metadata = buildMetadata(projectId);
  const requestBody: Record<string, unknown> = {
    tierId,
    metadata,
  };

  if (tierId !== "FREE" && projectId) {
    requestBody.cloudaicompanionProject = projectId;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(
        `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...CODE_ASSIST_HEADERS,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        return undefined;
      }

      const payload = (await response.json()) as OnboardUserPayload;
      const managedProjectId = payload.response?.cloudaicompanionProject?.id;
      if (payload.done && managedProjectId) {
        return managedProjectId;
      }
      if (payload.done && projectId) {
        return projectId;
      }
    } catch (error) {
      console.error("Failed to onboard Gemini managed project:", error);
      return undefined;
    }

    await wait(delayMs);
  }

  return undefined;
}

/**
 * Resolves an effective project ID for the current auth state, caching results.
 */
export async function ensureProjectContext(
  accessToken: string
): Promise<string> {
  // Check DB for stored managed project
  const auth = getAuth();
  if (auth?.managed_project_id) {
    return auth.managed_project_id;
  }

  // Check cache
  const cacheKey = accessToken.slice(0, 20); // Use first 20 chars as key
  const cached = projectContextResultCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Check pending
  const pending = projectContextPendingCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Resolve project context
  const resolveContext = async (): Promise<string> => {
    const loadPayload = await loadManagedProject(accessToken);
    if (loadPayload?.cloudaicompanionProject) {
      const managedProjectId = loadPayload.cloudaicompanionProject;
      updateManagedProject(managedProjectId);
      return managedProjectId;
    }

    // Try to onboard if no managed project
    const currentTierId = loadPayload?.currentTier?.id ?? undefined;
    const defaultTierId = getDefaultTierId(loadPayload?.allowedTiers);
    const tierId = currentTierId ?? defaultTierId ?? "FREE";

    const managedProjectId = await onboardManagedProject(accessToken, tierId);
    if (managedProjectId) {
      updateManagedProject(managedProjectId);
      return managedProjectId;
    }

    throw new Error(
      "Could not obtain a project ID. Please ensure you have Gemini API access."
    );
  };

  const promise = resolveContext()
    .then((result) => {
      projectContextPendingCache.delete(cacheKey);
      projectContextResultCache.set(cacheKey, result);
      return result;
    })
    .catch((error) => {
      projectContextPendingCache.delete(cacheKey);
      throw error;
    });

  projectContextPendingCache.set(cacheKey, promise);
  return promise;
}
