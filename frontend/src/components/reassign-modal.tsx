import { useState } from "react";
import { useReassignLead } from "../api/leads";
import { useUsers } from "../api/users";
import { Button } from "./ui/button";
import { Field, Select, TextArea } from "./ui/field";
import { Modal } from "./ui/modal";
import { useToast } from "./ui/toast";
import { humanize } from "../lib/format";

export function ReassignModal({
  open,
  onClose,
  leadId,
  currentOwnerName,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  currentOwnerName?: string | null;
}) {
  const toast = useToast();
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const reassign = useReassignLead();
  const [form, setForm] = useState({ toUserId: "", reason: "" });

  async function handleSubmit() {
    if (!form.toUserId) return;
    try {
      await reassign.mutateAsync({
        id: leadId,
        input: {
          toUserId: form.toUserId,
          reason: form.reason.trim() || undefined,
        },
      });
      toast.show({ title: "Lead reassigned", variant: "success" });
      setForm({ toUserId: "", reason: "" });
      onClose();
    } catch (error) {
      toast.show({
        title: "Could not reassign",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reassign lead"
      description={
        currentOwnerName ? `Currently owned by ${currentOwnerName}.` : "Currently unassigned."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={reassign.isPending}
            disabled={!form.toUserId}
            onClick={() => void handleSubmit()}
          >
            Reassign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="New owner" required>
          <Select
            value={form.toUserId}
            onChange={(event) => setForm({ ...form, toUserId: event.target.value })}
          >
            <option value="">Select teammate…</option>
            {(usersQuery.data?.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({humanize(user.employeeStatus)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" hint="Shown in the audit trail.">
          <TextArea
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
