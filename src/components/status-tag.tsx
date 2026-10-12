import {
  Ban,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  Clock,
  FileWarning,
  Hourglass,
  Inbox,
  ScanText,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  statusLabels,
  studentStatusLabels,
  type StudentStatus,
  type SubmissionStatus,
} from "@/lib/submission-status";
import { Tag, type Tone } from "./tag";

const statusStyle: Record<SubmissionStatus, { tone: Tone; icon: LucideIcon }> = {
  to_submit: { tone: "neutral", icon: CircleDashed },
  received: { tone: "info", icon: Inbox },
  transcribing: { tone: "info", icon: ScanText },
  transcription_failed: { tone: "danger", icon: FileWarning },
  evaluating: { tone: "info", icon: Hourglass },
  evaluation_failed: { tone: "danger", icon: TriangleAlert },
  not_assessable: { tone: "warning", icon: Ban },
  to_review: { tone: "warning", icon: ClipboardCheck },
  validated: { tone: "success", icon: CircleCheck },
  published: { tone: "success", icon: Send },
};

const studentStyle: Record<StudentStatus, { tone: Tone; icon: LucideIcon }> = {
  to_submit: { tone: "neutral", icon: CircleDashed },
  being_marked: { tone: "info", icon: Hourglass },
  marked: { tone: "success", icon: CheckCheck },
};

/** Teacher view: one of the internal states of §5.5. */
export function StatusTag({ status }: { status: SubmissionStatus }) {
  const { tone, icon } = statusStyle[status];
  return (
    <Tag tone={tone} icon={icon}>
      {statusLabels[status]}
    </Tag>
  );
}

/** Student view: the closed list of three states. */
export function StudentStatusTag({ status }: { status: StudentStatus }) {
  const { tone, icon } = studentStyle[status];
  return (
    <Tag tone={tone} icon={icon}>
      {studentStatusLabels[status]}
    </Tag>
  );
}

/**
 * Cross-cutting late flag (D8). "Late" once submitted; before submission,
 * the student sees "Deadline passed" instead.
 */
export function LateTag({ submitted = true }: { submitted?: boolean }) {
  return (
    <Tag tone="warning" icon={Clock}>
      {submitted ? "Late" : "Deadline passed"}
    </Tag>
  );
}
