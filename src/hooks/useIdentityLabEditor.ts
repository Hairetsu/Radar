import { useId, useState, type FormEvent } from "react";
import type { IdentityProfile, IdentityProfileDraft } from "../../shared/identityProfiles.js";
import {
  EMPTY_FORM,
  validOrigin,
  type IdentityFormState
} from "../components/identityLabPresentation";

type IdentityLabEditorOptions = {
  identities: ReadonlyMap<string, IdentityProfile>;
  busy: boolean;
  onCreate: (draft: IdentityProfileDraft) => void | Promise<void>;
  onUpdate: (profile: IdentityProfile) => void | Promise<void>;
};

export function useIdentityLabEditor({ identities, busy, onCreate, onUpdate }: IdentityLabEditorOptions) {
  const formId = useId();
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<IdentityFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const editingProfile = editingId ? identities.get(editingId) : undefined;
  const locked = busy || submitting;

  function beginEdit(profile: IdentityProfile) {
    setEditingId(profile.id);
    setForm({
      label: profile.label,
      kind: profile.kind,
      roleLabel: profile.roleLabel,
      tenantLabel: profile.tenantLabel,
      origin: profile.origin,
      notes: profile.notes
    });
    setFormError("");
  }

  function resetForm() {
    setEditingId("");
    setForm(EMPTY_FORM);
    setFormError("");
  }

  async function submitIdentity(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const origin = validOrigin(form.origin);
    if (!form.label.trim() || !form.roleLabel.trim() || !form.tenantLabel.trim() || !origin) {
      setFormError("Label, role, tenant, and an HTTP(S) origin are required.");
      return;
    }
    const draft: IdentityProfileDraft = {
      label: form.label.trim(),
      kind: form.kind,
      roleLabel: form.roleLabel.trim(),
      tenantLabel: form.tenantLabel.trim(),
      origin,
      notes: form.notes.trim(),
      refreshMode: editingProfile?.refreshMode || "manual",
      ...(editingProfile?.refreshWorkflowId ? { refreshWorkflowId: editingProfile.refreshWorkflowId } : {}),
      ...(editingProfile?.maxHealthAgeMs ? { maxHealthAgeMs: editingProfile.maxHealthAgeMs } : {})
    };
    setSubmitting(true);
    setFormError("");
    try {
      if (editingProfile) {
        await onUpdate({ ...editingProfile, ...draft, updatedAt: new Date().toISOString() });
      } else {
        await onCreate(draft);
      }
      resetForm();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : `Identity ${editingProfile ? "update" : "creation"} failed. Review the profile and try again.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  return {
    formId,
    form,
    setForm,
    formError,
    editingProfile,
    locked,
    beginEdit,
    resetForm,
    submitIdentity
  };
}
