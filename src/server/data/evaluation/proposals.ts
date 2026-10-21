import "server-only";
import { and, eq } from "drizzle-orm";
import type { ProposalAlert } from "@/lib/evaluation";
import type { CriterionId, Level } from "@/lib/rubric";
import type { Actor } from "@/server/access/actor";
import { authorize } from "@/server/access/policy";
import { db } from "@/server/db/client";
import { aiProposals, submissions } from "@/server/db/schema";
import { ownedBy } from "../access";

// EVL-03: the AI proposal in force of a submission, read by its teacher only
// (invariant 7: never by the student). Written by the system alone
// (system.ts), never changed.

export type CurrentProposal = {
  /** The version it evaluated: always the active one (SUB-05 R2). */
  versionNumber: number;
  criteria: Record<CriterionId, { level: Level; justification: string; quotes: string[] }>;
  generalComment: string;
  nextSteps: string[];
  alerts: ProposalAlert[];
  /** Calculated by the system: the sum of the levels (Q1 [D]). */
  proposedGrade: number;
};

type ProposalRow = typeof aiProposals.$inferSelect;

/** A stored proposal, criterion by criterion. */
export function proposalFromRow(p: ProposalRow): CurrentProposal {
  const criterion = (level: number, justification: string, quotes: string[]) => ({ level: level as Level, justification, quotes });
  return {
    versionNumber: p.versionNumber,
    criteria: {
      task: criterion(p.levelTask, p.justificationTask, p.quotesTask),
      organization: criterion(p.levelOrganization, p.justificationOrganization, p.quotesOrganization),
      vocabulary: criterion(p.levelVocabulary, p.justificationVocabulary, p.quotesVocabulary),
      grammar: criterion(p.levelGrammar, p.justificationGrammar, p.quotesGrammar),
      mechanics: criterion(p.levelMechanics, p.justificationMechanics, p.quotesMechanics),
    },
    generalComment: p.generalComment,
    nextSteps: p.nextSteps,
    alerts: p.alerts,
    proposedGrade: p.proposedGrade,
  };
}

/** Null when the submission is absent, another teacher's, or has no proposal in force. */
export async function getCurrentProposal(actor: Actor, submissionId: string): Promise<CurrentProposal | null> {
  const grant = authorize(actor, "aiProposal", "read");
  const [found] = await db
    .select({ p: aiProposals })
    .from(submissions)
    .innerJoin(aiProposals, eq(aiProposals.id, submissions.currentProposalId))
    .where(and(eq(submissions.id, submissionId), ownedBy(grant, { teacher: submissions.teacherId })));
  return found ? proposalFromRow(found.p) : null;
}
