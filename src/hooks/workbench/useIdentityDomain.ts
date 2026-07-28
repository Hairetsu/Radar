import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BrowserState,
  CapturedRequest,
  IdentityActivationRecord,
  IdentityProfile,
  IdentityProfileDraft
} from "../../types";

interface IdentityDomainPorts {
  setNotice: (message: string) => void;
  setBrowserState: (state: BrowserState) => void;
  setCaptures: (captures: CapturedRequest[]) => void;
}

export function useIdentityDomain(enabled: boolean, ports: IdentityDomainPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;

  const [identityProfiles, setIdentityProfiles] = useState<IdentityProfile[]>([]);
  const [identityActivations, setIdentityActivations] = useState<IdentityActivationRecord[]>([]);
  const [identityBusy, setIdentityBusy] = useState(false);

  const refreshIdentityLab = useCallback(async () => {
    if (!window.radar?.listIdentityProfiles || !enabled) {
      return;
    }
    const [nextProfiles, nextActivations] = await Promise.all([
      window.radar.listIdentityProfiles(),
      window.radar.listIdentityActivations?.() ?? []
    ]);
    setIdentityProfiles(nextProfiles);
    setIdentityActivations(nextActivations);
  }, [enabled]);

  useEffect(() => {
    void refreshIdentityLab();
  }, [refreshIdentityLab]);

  const createIdentityLabProfile = useCallback(async (draft: IdentityProfileDraft) => {
    if (!window.radar?.createIdentityProfile) {
      return;
    }
    setIdentityBusy(true);
    try {
      const profile = await window.radar.createIdentityProfile(draft);
      setIdentityProfiles((items) => [profile, ...items.filter((item) => item.id !== profile.id)]);
      portsRef.current.setNotice(`Identity created: ${profile.label}`);
    } finally {
      setIdentityBusy(false);
    }
  }, []);

  const updateIdentityLabProfile = useCallback(async (profile: IdentityProfile) => {
    if (!window.radar?.updateIdentityProfile) {
      return;
    }
    setIdentityBusy(true);
    try {
      const next = await window.radar.updateIdentityProfile({
        id: profile.id,
        draft: {
          label: profile.label,
          kind: profile.kind,
          roleLabel: profile.roleLabel,
          tenantLabel: profile.tenantLabel,
          origin: profile.origin,
          notes: profile.notes,
          refreshMode: profile.refreshMode,
          refreshWorkflowId: profile.refreshWorkflowId,
          maxHealthAgeMs: profile.maxHealthAgeMs
        }
      });
      setIdentityProfiles((items) => [next, ...items.filter((item) => item.id !== next.id)]);
      portsRef.current.setNotice(`Identity updated: ${next.label}`);
    } finally {
      setIdentityBusy(false);
    }
  }, []);

  const activateIdentityLabProfile = useCallback(async (identityId: string) => {
    if (!window.radar?.activateIdentityProfile) {
      return;
    }
    setIdentityBusy(true);
    try {
      const result = await window.radar.activateIdentityProfile({ identityId });
      setIdentityProfiles((items) => [result.identity, ...items.filter((item) => item.id !== result.identity.id)]);
      await refreshIdentityLab();
      portsRef.current.setBrowserState(await window.radar.getBrowserState());
      portsRef.current.setCaptures(await window.radar.getCaptures());
      portsRef.current.setNotice(`Identity active: ${result.identity.label}`);
    } finally {
      setIdentityBusy(false);
    }
  }, [refreshIdentityLab]);

  const verifyIdentityLabProfile = useCallback(async (identityId: string) => {
    if (!window.radar?.verifyIdentityProfile) {
      return;
    }
    setIdentityBusy(true);
    try {
      const profile = await window.radar.verifyIdentityProfile(identityId);
      setIdentityProfiles((items) => [profile, ...items.filter((item) => item.id !== profile.id)]);
      await refreshIdentityLab();
      portsRef.current.setCaptures(await window.radar.getCaptures());
      portsRef.current.setNotice(`Identity health: ${profile.label} / ${profile.health}`);
    } finally {
      setIdentityBusy(false);
    }
  }, [refreshIdentityLab]);

  const archiveIdentityLabProfile = useCallback(async (identityId: string) => {
    if (!window.radar?.archiveIdentityProfile) {
      return;
    }
    setIdentityBusy(true);
    try {
      const result = await window.radar.archiveIdentityProfile(identityId);
      setIdentityProfiles(result.identities);
      await refreshIdentityLab();
      portsRef.current.setNotice("Identity archived; browser profile data remains on disk.");
    } finally {
      setIdentityBusy(false);
    }
  }, [refreshIdentityLab]);

  const activeIdentityActivation = useMemo(
    () => identityActivations.find((activation) => activation.status === "active"),
    [identityActivations]
  );

  return {
    identityProfiles,
    identityActivations,
    activeIdentityActivation,
    identityBusy,
    refreshIdentityLab,
    createIdentityLabProfile,
    updateIdentityLabProfile,
    activateIdentityLabProfile,
    verifyIdentityLabProfile,
    archiveIdentityLabProfile
  };
}
