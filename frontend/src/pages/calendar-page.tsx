import { useMemo, useState } from "react";
import type { Appointment, CreateAppointmentInput } from "@leadflow/shared";
import {
  useAppointments,
  useCreateAppointment,
  useDeleteAppointment,
  useUpdateAppointment,
} from "../api/appointments";
import { useContacts } from "../api/crm";
import { useUsers } from "../api/users";
import { Avatar } from "../components/ui/avatar";
import { Badge, StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, PageHeader } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Field, Select, TextArea, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { useToast } from "../components/ui/toast";
import {
  addDays,
  formatDate,
  formatTime,
  isSameDay,
  startOfWeek,
  toDateInputValue,
  toDateTimeInputValue,
} from "../lib/format";
import { cn } from "../lib/cn";

export function CalendarPage() {
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [userId, setUserId] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const from = weekDays[0]?.toISOString() ?? new Date().toISOString();
  const to = addDays(weekStart, 7).toISOString();

  const appointmentsQuery = useAppointments({
    page: 1,
    pageSize: 100,
    userId: userId || undefined,
    from,
    to,
  });
  const contactsQuery = useContacts({ page: 1, pageSize: 100 });
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();

  const contactsById = new Map((contactsQuery.data?.data ?? []).map((c) => [c.id, c]));
  const usersById = new Map((usersQuery.data?.data ?? []).map((u) => [u.id, u]));

  const appointments = appointmentsQuery.data?.data ?? [];
  const today = new Date();

  const [bookForm, setBookForm] = useState({
    contactId: "",
    userId: "",
    title: "",
    date: toDateInputValue(today),
    time: "10:00",
    durationMinutes: "45",
    description: "",
  });
  const [bookError, setBookError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    startsAt: "",
    endsAt: "",
    status: "scheduled" as "scheduled" | "cancelled",
  });

  function handleBook() {
    setBookForm({
      contactId: "",
      userId: "",
      title: "",
      date: toDateInputValue(today),
      time: "10:00",
      durationMinutes: "45",
      description: "",
    });
    setBookError(null);
    setBookOpen(true);
  }

  async function handleCreate() {
    if (!bookForm.contactId || !bookForm.userId || bookForm.title.trim().length < 2) {
      setBookError("Contact, teammate and a title (2+ characters) are required");
      return;
    }
    const starts = new Date(`${bookForm.date}T${bookForm.time}`);
    if (Number.isNaN(starts.getTime())) {
      setBookError("Pick a valid date and time");
      return;
    }
    const ends = new Date(starts.getTime() + Number(bookForm.durationMinutes) * 60_000);
    const input: CreateAppointmentInput = {
      contactId: bookForm.contactId,
      userId: bookForm.userId,
      title: bookForm.title.trim(),
      description: bookForm.description.trim() || undefined,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    try {
      await createAppointment.mutateAsync(input);
      toast.show({
        title: "Appointment booked",
        description: "Google Calendar sync runs in the background.",
        variant: "success",
      });
      setBookOpen(false);
    } catch (error) {
      setBookError(error instanceof Error ? error.message : "Could not book appointment");
    }
  }

  function openEdit(appointment: Appointment) {
    setEditForm({
      title: appointment.title,
      description: appointment.description ?? "",
      startsAt: toDateTimeInputValue(new Date(appointment.startsAt)),
      endsAt: toDateTimeInputValue(new Date(appointment.endsAt)),
      status: appointment.status,
    });
    setEditing(appointment);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    try {
      await updateAppointment.mutateAsync({
        id: editing.id,
        input: {
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          startsAt: new Date(editForm.startsAt).toISOString(),
          endsAt: new Date(editForm.endsAt).toISOString(),
          status: editForm.status,
        },
      });
      toast.show({ title: "Appointment updated", variant: "success" });
      setEditing(null);
    } catch (error) {
      toast.show({
        title: "Could not update appointment",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Calendar"
        description="Bookings sync to each teammate's Google Calendar."
        actions={
          <>
            <Select
              className="w-40"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              aria-label="Filter by teammate"
            >
              <option value="">All teammates</option>
              {(usersQuery.data?.data ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
            <Button onClick={handleBook}>Book appointment</Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
            >
              ← Previous
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              This week
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Next →
            </Button>
          </div>
          <p className="text-sm font-medium text-slate-700">
            {formatDate(weekDays[0] ?? weekStart)} – {formatDate(weekDays[6] ?? weekStart)}
          </p>
        </div>
      </Card>

      {appointmentsQuery.isPending ? <LoadingBlock /> : null}
      {appointmentsQuery.isError ? (
        <ErrorBlock error={appointmentsQuery.error} onRetry={() => void appointmentsQuery.refetch()} />
      ) : null}

      {appointmentsQuery.data ? (
        <div className="grid gap-3 lg:grid-cols-7">
          {weekDays.map((day) => {
            const dayAppointments = appointments
              .filter((appointment) => isSameDay(new Date(appointment.startsAt), day))
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const isToday = isSameDay(day, today);
            return (
              <section
                key={day.toISOString()}
                className={cn(
                  "flex min-h-40 flex-col rounded-xl border bg-white",
                  isToday ? "border-slate-900" : "border-slate-200",
                )}
                aria-label={formatDate(day)}
              >
                <header
                  className={cn(
                    "border-b px-3 py-2 text-center",
                    isToday ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200",
                  )}
                >
                  <p className="text-xs uppercase">{formatDate(day).split(",")[0]}</p>
                  <p className="text-sm font-semibold">{day.getDate()}</p>
                </header>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {dayAppointments.length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-400">—</p>
                  ) : null}
                  {dayAppointments.map((appointment) => {
                    const contact = contactsById.get(appointment.contactId);
                    const assignee = usersById.get(appointment.userId);
                    const cancelled = appointment.status === "cancelled";
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => openEdit(appointment)}
                        className={cn(
                          "rounded-lg border border-slate-200 p-2 text-left hover:border-slate-400",
                          cancelled ? "opacity-60" : "",
                        )}
                      >
                        <p className="text-xs text-slate-500">
                          {formatTime(appointment.startsAt)}–{formatTime(appointment.endsAt)}
                        </p>
                        <p
                          className={cn(
                            "text-xs font-medium text-slate-900",
                            cancelled ? "line-through" : "",
                          )}
                        >
                          {appointment.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {contact?.name ?? "Unknown contact"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {assignee ? <Avatar name={assignee.name} className="h-5 w-5 text-[10px]" /> : null}
                          <StatusBadge status={appointment.syncState} />
                        </div>
                        {appointment.syncError ? (
                          <p className="mt-1 text-xs text-red-600">{appointment.syncError}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {appointmentsQuery.data && appointments.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            title="No appointments this week"
            description="Book an appointment or move to another week."
            action={<Button onClick={handleBook}>Book appointment</Button>}
          />
        </Card>
      ) : null}

      <Modal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        title="Book appointment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBookOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} isLoading={createAppointment.isPending}>
              Book
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Contact" required>
            <Select
              value={bookForm.contactId}
              onChange={(event) => setBookForm({ ...bookForm, contactId: event.target.value })}
            >
              <option value="">Select contact…</option>
              {(contactsQuery.data?.data ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teammate" required hint="Their Google Calendar receives the invite.">
            <Select
              value={bookForm.userId}
              onChange={(event) => setBookForm({ ...bookForm, userId: event.target.value })}
            >
              <option value="">Select teammate…</option>
              {(usersQuery.data?.data ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required>
            <TextInput
              value={bookForm.title}
              onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })}
              placeholder="Discovery call"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" required>
              <TextInput
                type="date"
                value={bookForm.date}
                onChange={(event) => setBookForm({ ...bookForm, date: event.target.value })}
              />
            </Field>
            <Field label="Start time" required>
              <TextInput
                type="time"
                value={bookForm.time}
                onChange={(event) => setBookForm({ ...bookForm, time: event.target.value })}
              />
            </Field>
            <Field label="Duration">
              <Select
                value={bookForm.durationMinutes}
                onChange={(event) =>
                  setBookForm({ ...bookForm, durationMinutes: event.target.value })
                }
              >
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <TextArea
              value={bookForm.description}
              onChange={(event) => setBookForm({ ...bookForm, description: event.target.value })}
            />
          </Field>
          {bookError ? (
            <p role="alert" className="text-sm text-red-600">
              {bookError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit — ${editing.title}` : "Edit appointment"}
        footer={
          <>
            <Button variant="ghost" onClick={() => editing && setDeleteTarget(editing)}>
              Delete
            </Button>
            <Button
              variant="secondary"
              onClick={() => setEditing(null)}
              className="ml-auto"
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} isLoading={updateAppointment.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                {contactsById.get(editing.contactId)?.name ?? "Unknown contact"} ·{" "}
                {usersById.get(editing.userId)?.name ?? "Unassigned"}
              </p>
              <Badge tone={editing.syncState === "synced" ? "green" : "slate"}>
                {editing.syncState}
              </Badge>
            </div>
            <Field label="Title" required>
              <TextInput
                value={editForm.title}
                onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts at">
                <TextInput
                  type="datetime-local"
                  value={editForm.startsAt}
                  onChange={(event) => setEditForm({ ...editForm, startsAt: event.target.value })}
                />
              </Field>
              <Field label="Ends at">
                <TextInput
                  type="datetime-local"
                  value={editForm.endsAt}
                  onChange={(event) => setEditForm({ ...editForm, endsAt: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Status">
              <Select
                value={editForm.status}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    status: event.target.value as "scheduled" | "cancelled",
                  })
                }
              >
                <option value="scheduled">Scheduled</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
            <Field label="Description">
              <TextArea
                value={editForm.description}
                onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete appointment"
        description={
          deleteTarget ? `Delete "${deleteTarget.title}"? It is removed from Google Calendar too.` : ""
        }
        confirmLabel="Delete appointment"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteAppointment.mutateAsync(deleteTarget.id);
            toast.show({ title: "Appointment deleted", variant: "success" });
            setEditing(null);
          } catch (error) {
            toast.show({
              title: "Could not delete appointment",
              description: error instanceof Error ? error.message : undefined,
              variant: "error",
            });
          }
        }}
      />
    </div>
  );
}
