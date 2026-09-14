/**
 * Soft bridge to pi-multiprovider.
 *
 * When pi-multiprovider pools several opencode-go accounts it announces a
 * service on Pi's event bus and notifies followers whenever the session's
 * active account changes — including a resume, which replays the account the
 * session last switched to. Usage is account-scoped: each account has its own
 * 5h / 7d / 30d budget, so the widget has to bill the active pooled account
 * instead of whichever credential Pi resolves on its own. Without that
 * extension everything here stays inert and resolution is unchanged.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const MULTIPROVIDER_SERVICE_EVENT = "pi-multiprovider:service";

export type MultiproviderActiveAccount = {
  id: string;
  label: string;
  authKind: string;
};

export type MultiproviderAccountAuth = {
  accessToken: string;
  label: string;
  source?: string;
};

export type MultiproviderAccountChangedEvent = {
  providerId: string;
  account: MultiproviderActiveAccount | undefined;
  ctx: ExtensionContext;
};

export type MultiproviderServiceContext = Pick<
  ExtensionContext,
  "modelRegistry" | "model" | "sessionManager"
>;

export type MultiproviderService = {
  getActiveAccount(
    providerId: string,
    ctx: MultiproviderServiceContext,
  ): Promise<MultiproviderActiveAccount | undefined>;
  resolveActiveAccountAuth(
    providerId: string,
    ctx: MultiproviderServiceContext,
    signal?: AbortSignal,
  ): Promise<MultiproviderAccountAuth | undefined>;
  onActiveAccountChanged(
    providerId: string,
    callback: (event: MultiproviderAccountChangedEvent) => void,
  ): () => void;
};

export function isMultiproviderService(value: unknown): value is MultiproviderService {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MultiproviderService>;
  return (
    typeof candidate.getActiveAccount === "function" &&
    typeof candidate.resolveActiveAccountAuth === "function" &&
    typeof candidate.onActiveAccountChanged === "function"
  );
}

let activeService: MultiproviderService | undefined;

export function setActiveMultiproviderService(service: MultiproviderService | undefined): void {
  activeService = service;
}

export function getActiveMultiproviderService(): MultiproviderService | undefined {
  return activeService;
}
