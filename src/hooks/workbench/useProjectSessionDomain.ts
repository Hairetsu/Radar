import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalContext, LocalProfile, LocalSessionSummary } from "../../types";
import {
  applyWorkbenchSnapshot,
  loadWorkbenchSnapshot,
  type WorkbenchHydrationPorts
} from "./workbenchHydration";
import { useWorkbenchPolling } from "./useWorkbenchPolling";

interface ProjectSessionPorts {
  setNotice: (message: string) => void;
  hydration: WorkbenchHydrationPorts;
}

function defaultSessionName(createdAt = new Date()) {
  return `Session ${createdAt.toISOString().slice(0, 16).replace("T", " ")}`;
}

export type ProjectSessionDomain = ReturnType<
  typeof useProjectSessionDomain
>;

export function useProjectSessionDomain(ports: ProjectSessionPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;

  const [localContext, setLocalContext] = useState<LocalContext | null>(null);
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([]);
  const [profileName, setProfileName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [profileSessionOpen, setProfileSessionOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");

  const replaceLocalLists = useCallback(
    (nextProfiles: LocalProfile[], nextSessions: LocalSessionSummary[]) => {
      setProfiles(nextProfiles);
      setSessions(nextSessions);
    },
    []
  );

  const refreshLocalLists = useCallback(async (context: LocalContext) => {
    if (!window.radar) {
      return;
    }
    const [nextProfiles, nextSessions] = await Promise.all([
      window.radar.listLocalProfiles(),
      window.radar.listLocalSessions(context.profile.id)
    ]);
    replaceLocalLists(nextProfiles, nextSessions);
  }, [replaceLocalLists]);

  const applyLocalContext = useCallback(async (context: LocalContext, noticeText?: string) => {
    setLocalContext(context);
    setProfileName(context.profile.name);
    setSessionName(context.session.name);
    const snapshot = await loadWorkbenchSnapshot();
    if (snapshot) {
      applyWorkbenchSnapshot(snapshot, portsRef.current.hydration);
      await refreshLocalLists(context);
    }
    if (noticeText) {
      portsRef.current.setNotice(noticeText);
    }
  }, [refreshLocalLists]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.radar) {
        return;
      }
      const context = await window.radar.getLocalContext();
      if (!cancelled) {
        await applyLocalContext(context);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyLocalContext]);

  useWorkbenchPolling(localContext?.profile.id || "", {
    hydration: ports.hydration,
    replaceLocalLists
  });

  const openNewSessionDialog = useCallback(() => {
    setNewSessionName(defaultSessionName());
    setNewSessionOpen(true);
  }, []);

  const createLocalProfile = useCallback(async () => {
    if (!window.radar) {
      portsRef.current.setNotice("Run in Electron to create a project.");
      return;
    }
    const context = await window.radar.createLocalProfile(profileName);
    await applyLocalContext(context, `Project opened: ${context.profile.name}`);
  }, [applyLocalContext, profileName]);

  const saveLocalProfile = useCallback(async () => {
    if (!window.radar || !localContext) {
      portsRef.current.setNotice("Run in Electron to save a project.");
      return;
    }
    const profile = await window.radar.saveLocalProfile({
      id: localContext.profile.id,
      name: profileName
    });
    const context = { ...localContext, profile };
    setLocalContext(context);
    setProfileName(profile.name);
    await refreshLocalLists(context);
    portsRef.current.setNotice(`Project saved: ${profile.name}`);
  }, [localContext, profileName, refreshLocalLists]);

  const loadLocalProfile = useCallback(async (profileId: string) => {
    if (!window.radar) {
      portsRef.current.setNotice("Run in Electron to load a project.");
      return;
    }
    const context = await window.radar.loadLocalProfile(profileId);
    await applyLocalContext(context, `Project loaded: ${context.profile.name}`);
  }, [applyLocalContext]);

  const createLocalSession = useCallback(async (name?: string) => {
    if (!window.radar) {
      portsRef.current.setNotice("Run in Electron to create a session.");
      return;
    }
    const context = await window.radar.createLocalSession(name);
    await applyLocalContext(context, `Session opened: ${context.session.name}`);
  }, [applyLocalContext]);

  const confirmNewSession = useCallback(async () => {
    await createLocalSession(newSessionName);
    setNewSessionOpen(false);
  }, [createLocalSession, newSessionName]);

  const saveLocalSession = useCallback(async () => {
    if (!window.radar || !localContext) {
      portsRef.current.setNotice("Run in Electron to save a session.");
      return;
    }
    const session = await window.radar.saveLocalSession({
      id: localContext.session.id,
      name: sessionName
    });
    const context = { ...localContext, session };
    setLocalContext(context);
    setSessionName(session.name);
    await refreshLocalLists(context);
    portsRef.current.setNotice(`Session saved: ${session.name}`);
  }, [localContext, refreshLocalLists, sessionName]);

  const loadLocalSession = useCallback(async (sessionId: string) => {
    if (!window.radar) {
      portsRef.current.setNotice("Run in Electron to load a session.");
      return;
    }
    const context = await window.radar.loadLocalSession(sessionId);
    await applyLocalContext(context, `Session loaded: ${context.session.name}`);
  }, [applyLocalContext]);

  const seedDemoProject = useCallback(async () => {
    if (!window.radar?.seedDemoProject) {
      portsRef.current.setNotice("Run in Electron to load demo data.");
      return;
    }
    const context = await window.radar.seedDemoProject();
    await applyLocalContext(context, `Demo project loaded: ${context.session.name}`);
  }, [applyLocalContext]);

  return {
    localContext,
    profiles,
    sessions,
    profileName,
    setProfileName,
    sessionName,
    setSessionName,
    profileSessionOpen,
    setProfileSessionOpen,
    newSessionOpen,
    setNewSessionOpen,
    newSessionName,
    setNewSessionName,
    applyLocalContext,
    openNewSessionDialog,
    createLocalProfile,
    saveLocalProfile,
    loadLocalProfile,
    createLocalSession,
    confirmNewSession,
    saveLocalSession,
    loadLocalSession,
    seedDemoProject
  };
}
