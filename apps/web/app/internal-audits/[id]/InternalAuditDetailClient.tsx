'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  IdentityOption,
  InternalAuditChecklistItem,
  InternalAuditChecklistSection,
  InternalAuditDetailResponse,
  InternalAuditFinding,
  InternalAuditMember,
  addInternalAuditMember,
  cancelInternalAudit,
  closeInternalAuditFinding,
  completeInternalAudit,
  createInternalAuditChecklistItem,
  createInternalAuditChecklistSection,
  createInternalAuditFinding,
  deleteInternalAuditMember,
  getIdentityLabel,
  getInternalAuditDetail,
  listIdentityOptions,
  listInternalAuditChecklistItems,
  listInternalAuditChecklistSections,
  listInternalAuditFindings,
  listInternalAuditMembers,
  recordInternalAuditChecklistResult,
  startInternalAudit,
  updateInternalAudit,
  updateInternalAuditChecklistItem,
  updateInternalAuditChecklistSection,
  updateInternalAuditFinding,
} from '../../lib/internal-audits';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}

function formatDate(value?: string | null) {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-700';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-700';
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    case 'OPEN':
      return 'bg-red-100 text-red-700';
    case 'UNDER_REVIEW':
      return 'bg-amber-100 text-amber-700';
    case 'CLOSED':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function resultBadgeClass(status: string) {
  switch (status) {
    case 'COMPLIANT':
      return 'bg-emerald-100 text-emerald-700';
    case 'NONCOMPLIANT':
      return 'bg-red-100 text-red-700';
    case 'OBSERVATION':
      return 'bg-amber-100 text-amber-700';
    case 'NOT_APPLICABLE':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function findingSeverityClass(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-red-100 text-red-700';
    case 'HIGH':
      return 'bg-orange-100 text-orange-700';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function findingStatusSortOrder(status: string) {
  switch (status) {
    case 'OPEN':
      return 0;
    case 'UNDER_REVIEW':
      return 1;
    case 'CLOSED':
      return 2;
    default:
      return 99;
  }
}

function findingSeveritySortOrder(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return 0;
    case 'HIGH':
      return 1;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 3;
    default:
      return 99;
  }
}

type OverviewFormState = {
  audit_title: string;
  audit_type: string;
  planned_start_date: string;
  planned_end_date: string;
  lead_auditor_identity_id: string;
  objective: string;
  scope_summary: string;
  auditee_summary: string;
  notes: string;
};

type MemberFormState = {
  identity_id: string;
  member_role: string;
  notes: string;
};

type SectionFormState = {
  title: string;
  description: string;
  clause_code: string;
  sort_order: string;
};

type ItemFormState = {
  section_id: string;
  item_code: string;
  requirement_text: string;
  expected_evidence: string;
  clause_code: string;
  sort_order: string;
  is_mandatory: boolean;
};

type ResultFormState = {
  result_status: string;
  observation_notes: string;
  assessed_by_identity_id: string;
};

type FindingFormState = {
  checklist_item_id: string;
  finding_code: string;
  title: string;
  description: string;
  severity: string;
  owner_identity_id: string;
  due_date: string;
};

type CancelFormState = {
  notes: string;
};

type CloseFindingFormState = {
  closure_notes: string;
};

type FindingFiltersState = {
  q: string;
  status: string;
  severity: string;
};

const initialOverviewForm: OverviewFormState = {
  audit_title: '',
  audit_type: 'INTERNAL',
  planned_start_date: '',
  planned_end_date: '',
  lead_auditor_identity_id: '',
  objective: '',
  scope_summary: '',
  auditee_summary: '',
  notes: '',
};

const initialMemberForm: MemberFormState = {
  identity_id: '',
  member_role: 'AUDITOR',
  notes: '',
};

const initialSectionForm: SectionFormState = {
  title: '',
  description: '',
  clause_code: '',
  sort_order: '0',
};

const initialItemForm: ItemFormState = {
  section_id: '',
  item_code: '',
  requirement_text: '',
  expected_evidence: '',
  clause_code: '',
  sort_order: '0',
  is_mandatory: true,
};

const initialResultForm: ResultFormState = {
  result_status: 'COMPLIANT',
  observation_notes: '',
  assessed_by_identity_id: '',
};

const initialFindingForm: FindingFormState = {
  checklist_item_id: '',
  finding_code: '',
  title: '',
  description: '',
  severity: 'LOW',
  owner_identity_id: '',
  due_date: '',
};

const initialCancelForm: CancelFormState = {
  notes: '',
};

const initialCloseFindingForm: CloseFindingFormState = {
  closure_notes: '',
};

const initialFindingFilters: FindingFiltersState = {
  q: '',
  status: 'ALL',
  severity: 'ALL',
};

export default function InternalAuditDetailClient({
  auditId,
}: {
  auditId: string;
}) {
  const [detail, setDetail] = useState<InternalAuditDetailResponse | null>(null);
  const [members, setMembers] = useState<InternalAuditMember[]>([]);
  const [sections, setSections] = useState<InternalAuditChecklistSection[]>([]);
  const [items, setItems] = useState<InternalAuditChecklistItem[]>([]);
  const [findings, setFindings] = useState<InternalAuditFinding[]>([]);
  const [identities, setIdentities] = useState<IdentityOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [overviewEditOpen, setOverviewEditOpen] = useState(false);
  const [overviewForm, setOverviewForm] = useState<OverviewFormState>(initialOverviewForm);
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberFormState>(initialMemberForm);
  const [savingMember, setSavingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | number | null>(null);

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<InternalAuditChecklistSection | null>(
    null
  );
  const [sectionForm, setSectionForm] = useState<SectionFormState>(initialSectionForm);
  const [savingSection, setSavingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InternalAuditChecklistItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [selectedResultItem, setSelectedResultItem] = useState<InternalAuditChecklistItem | null>(
    null
  );
  const [resultForm, setResultForm] = useState<ResultFormState>(initialResultForm);
  const [savingResult, setSavingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  const [findingModalOpen, setFindingModalOpen] = useState(false);
  const [editingFinding, setEditingFinding] = useState<InternalAuditFinding | null>(null);
  const [findingForm, setFindingForm] = useState<FindingFormState>(initialFindingForm);
  const [savingFinding, setSavingFinding] = useState(false);
  const [findingError, setFindingError] = useState<string | null>(null);
  const [findingFilters, setFindingFilters] = useState<FindingFiltersState>(initialFindingFilters);

  const [closeFindingModalOpen, setCloseFindingModalOpen] = useState(false);
  const [selectedCloseFinding, setSelectedCloseFinding] = useState<InternalAuditFinding | null>(
    null
  );
  const [closeFindingForm, setCloseFindingForm] =
    useState<CloseFindingFormState>(initialCloseFindingForm);
  const [closingFinding, setClosingFinding] = useState(false);
  const [closeFindingError, setCloseFindingError] = useState<string | null>(null);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelForm, setCancelForm] = useState<CancelFormState>(initialCancelForm);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellingAudit, setCancellingAudit] = useState(false);

  const [processingAction, setProcessingAction] = useState<
    'start' | 'complete' | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setPageError(null);

      const resolvedAuditId = String(auditId);

      const [
        detailData,
        membersData,
        sectionsData,
        itemsData,
        findingsData,
        identitiesData,
      ] = await Promise.all([
        getInternalAuditDetail(resolvedAuditId),
        listInternalAuditMembers(resolvedAuditId),
        listInternalAuditChecklistSections(resolvedAuditId),
        listInternalAuditChecklistItems(resolvedAuditId),
        listInternalAuditFindings(resolvedAuditId),
        listIdentityOptions({ page: 1, page_size: 50 }),
      ]);

      setDetail(detailData);
      setMembers(membersData.items || []);
      setSections(sectionsData.items || []);
      setItems(itemsData.items || []);
      setFindings(findingsData.items || []);
      setIdentities(identitiesData.items || []);
    } catch (err) {
      setPageError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [auditId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    if (!detail?.plan) return;

    setOverviewForm({
      audit_title: detail.plan.audit_title || '',
      audit_type: detail.plan.audit_type || 'INTERNAL',
      planned_start_date: detail.plan.planned_start_date || '',
      planned_end_date: detail.plan.planned_end_date || '',
      lead_auditor_identity_id: detail.plan.lead_auditor_identity_id
        ? String(detail.plan.lead_auditor_identity_id)
        : '',
      objective: detail.plan.objective || '',
      scope_summary: detail.plan.scope_summary || '',
      auditee_summary: detail.plan.auditee_summary || '',
      notes: detail.plan.notes || '',
    });
  }, [detail]);

  const sectionMap = useMemo(() => {
    return new Map(sections.map((section) => [String(section.id), section]));
  }, [sections]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aSectionSort = a.section_id
        ? (sectionMap.get(String(a.section_id))?.sort_order ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const bSectionSort = b.section_id
        ? (sectionMap.get(String(b.section_id))?.sort_order ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

      if (aSectionSort !== bSectionSort) return aSectionSort - bSectionSort;

      const aSectionTitle = a.section_title || '';
      const bSectionTitle = b.section_title || '';
      if (aSectionTitle !== bSectionTitle) {
        return aSectionTitle.localeCompare(bSectionTitle);
      }

      const aSort = a.sort_order ?? 0;
      const bSort = b.sort_order ?? 0;
      if (aSort !== bSort) return aSort - bSort;

      return (a.item_code || '').localeCompare(b.item_code || '');
    });
  }, [items, sectionMap]);

  const hasActiveFindingFilters = useMemo(() => {
    return (
      findingFilters.q.trim() !== '' ||
      findingFilters.status !== 'ALL' ||
      findingFilters.severity !== 'ALL'
    );
  }, [findingFilters]);

  const filteredFindings = useMemo(() => {
    const keyword = findingFilters.q.trim().toLowerCase();

    return [...findings]
      .filter((finding) => {
        if (findingFilters.status !== 'ALL' && finding.status !== findingFilters.status) {
          return false;
        }

        if (
          findingFilters.severity !== 'ALL' &&
          finding.severity !== findingFilters.severity
        ) {
          return false;
        }

        if (!keyword) return true;

        const haystack = [
          finding.finding_code,
          finding.title,
          finding.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(keyword);
      })
      .sort((a, b) => {
        const statusCompare =
          findingStatusSortOrder(a.status) - findingStatusSortOrder(b.status);
        if (statusCompare !== 0) return statusCompare;

        const severityCompare =
          findingSeveritySortOrder(a.severity) - findingSeveritySortOrder(b.severity);
        if (severityCompare !== 0) return severityCompare;

        const dueDateA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const dueDateB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (dueDateA !== dueDateB) return dueDateA - dueDateB;

        return (a.finding_code || '').localeCompare(b.finding_code || '');
      });
  }, [findings, findingFilters]);

  async function refreshAll() {
    await loadAll();
  }

  async function handleOverviewSave(e: FormEvent) {
    e.preventDefault();

    try {
      setSavingOverview(true);
      setOverviewError(null);

      const payload: Record<string, unknown> = {
        audit_title: overviewForm.audit_title.trim(),
        audit_type: overviewForm.audit_type,
        planned_start_date: overviewForm.planned_start_date || undefined,
        planned_end_date: overviewForm.planned_end_date || undefined,
        objective: overviewForm.objective.trim() || undefined,
        scope_summary: overviewForm.scope_summary.trim() || undefined,
        auditee_summary: overviewForm.auditee_summary.trim() || undefined,
        notes: overviewForm.notes.trim() || undefined,
      };

      if (overviewForm.lead_auditor_identity_id) {
        payload.lead_auditor_identity_id = Number(overviewForm.lead_auditor_identity_id);
      }

      await updateInternalAudit(auditId, payload);
      setOverviewEditOpen(false);
      setSuccessMessage('Overview updated successfully.');
      await refreshAll();
    } catch (err) {
      setOverviewError(getErrorMessage(err));
    } finally {
      setSavingOverview(false);
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();

    try {
      setSavingMember(true);
      setMemberError(null);
      setMemberActionError(null);

      await addInternalAuditMember(auditId, {
        identity_id: Number(memberForm.identity_id),
        member_role: memberForm.member_role,
        notes: memberForm.notes.trim() || undefined,
      });

      setMemberModalOpen(false);
      setMemberForm(initialMemberForm);
      setSuccessMessage('Member added successfully.');
      await refreshAll();
    } catch (err) {
      setMemberError(getErrorMessage(err));
    } finally {
      setSavingMember(false);
    }
  }

  async function handleDeleteMember(member: InternalAuditMember) {
    const memberLabel =
      member.identity_name || member.identity_email || `member #${String(member.id)}`;

    const ok = window.confirm(`Remove ${memberLabel} from this audit plan?`);
    if (!ok) return;

    try {
      setDeletingMemberId(member.id);
      setMemberActionError(null);

      await deleteInternalAuditMember(auditId, member.id);

      setSuccessMessage('Member removed successfully.');
      await refreshAll();
    } catch (err) {
      setMemberActionError(getErrorMessage(err));
    } finally {
      setDeletingMemberId(null);
    }
  }

  async function handleSaveSection(e: FormEvent) {
    e.preventDefault();

    try {
      setSavingSection(true);
      setSectionError(null);

      const payload = {
        title: sectionForm.title.trim(),
        description: sectionForm.description.trim() || undefined,
        clause_code: sectionForm.clause_code.trim() || undefined,
        sort_order: Number(sectionForm.sort_order || 0),
      };

      if (editingSection) {
        await updateInternalAuditChecklistSection(auditId, editingSection.id, payload);
        setSuccessMessage('Checklist section updated successfully.');
      } else {
        await createInternalAuditChecklistSection(auditId, payload);
        setSuccessMessage('Checklist section created successfully.');
      }

      setSectionModalOpen(false);
      setEditingSection(null);
      setSectionForm(initialSectionForm);
      await refreshAll();
    } catch (err) {
      setSectionError(getErrorMessage(err));
    } finally {
      setSavingSection(false);
    }
  }

  async function handleSaveItem(e: FormEvent) {
    e.preventDefault();

    try {
      setSavingItem(true);
      setItemError(null);

      const payload = {
        section_id: itemForm.section_id ? Number(itemForm.section_id) : undefined,
        item_code: itemForm.item_code.trim(),
        requirement_text: itemForm.requirement_text.trim(),
        expected_evidence: itemForm.expected_evidence.trim() || undefined,
        clause_code: itemForm.clause_code.trim() || undefined,
        sort_order: Number(itemForm.sort_order || 0),
        is_mandatory: itemForm.is_mandatory,
      };

      if (editingItem) {
        await updateInternalAuditChecklistItem(auditId, editingItem.id, payload);
        setSuccessMessage('Checklist item updated successfully.');
      } else {
        await createInternalAuditChecklistItem(auditId, payload);
        setSuccessMessage('Checklist item created successfully.');
      }

      setItemModalOpen(false);
      setEditingItem(null);
      setItemForm(initialItemForm);
      await refreshAll();
    } catch (err) {
      setItemError(getErrorMessage(err));
    } finally {
      setSavingItem(false);
    }
  }

  async function handleStartAudit() {
    const ok = window.confirm(
      'Are you sure you want to start this audit? After it starts, structure editing will be locked.'
    );
    if (!ok) return;

    try {
      setProcessingAction('start');
      setActionError(null);
      await startInternalAudit(auditId);
      setSuccessMessage('Audit started successfully.');
      await refreshAll();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setProcessingAction(null);
    }
  }

  async function handleCompleteAudit() {
    const ok = window.confirm(
      'Are you sure you want to complete this audit? Make sure all mandatory checklist items already have results.'
    );
    if (!ok) return;

    try {
      setProcessingAction('complete');
      setActionError(null);
      await completeInternalAudit(auditId);
      setSuccessMessage('Audit completed successfully.');
      await refreshAll();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setProcessingAction(null);
    }
  }

  async function handleCancelAudit(e: FormEvent) {
    e.preventDefault();

    try {
      setCancellingAudit(true);
      setCancelError(null);
      await cancelInternalAudit(auditId, {
        notes: cancelForm.notes.trim() || undefined,
      });
      setCancelModalOpen(false);
      setCancelForm(initialCancelForm);
      setSuccessMessage('Audit cancelled successfully.');
      await refreshAll();
    } catch (err) {
      setCancelError(getErrorMessage(err));
    } finally {
      setCancellingAudit(false);
    }
  }

  async function handleSaveResult(e: FormEvent) {
    e.preventDefault();
    if (!selectedResultItem) return;

    try {
      setSavingResult(true);
      setResultError(null);

      await recordInternalAuditChecklistResult(auditId, selectedResultItem.id, {
        result_status: resultForm.result_status,
        observation_notes: resultForm.observation_notes.trim() || undefined,
        assessed_by_identity_id: resultForm.assessed_by_identity_id
          ? Number(resultForm.assessed_by_identity_id)
          : undefined,
      });

      setResultModalOpen(false);
      setSelectedResultItem(null);
      setResultForm(initialResultForm);
      setSuccessMessage('Checklist result recorded successfully.');
      await refreshAll();
    } catch (err) {
      setResultError(getErrorMessage(err));
    } finally {
      setSavingResult(false);
    }
  }

  async function handleSaveFinding(e: FormEvent) {
    e.preventDefault();

    try {
      setSavingFinding(true);
      setFindingError(null);

      const payload = {
        checklist_item_id: findingForm.checklist_item_id
          ? Number(findingForm.checklist_item_id)
          : undefined,
        finding_code: findingForm.finding_code.trim(),
        title: findingForm.title.trim(),
        description: findingForm.description.trim(),
        severity: findingForm.severity,
        owner_identity_id: findingForm.owner_identity_id
          ? Number(findingForm.owner_identity_id)
          : undefined,
        due_date: findingForm.due_date || undefined,
      };

      if (editingFinding) {
        await updateInternalAuditFinding(auditId, editingFinding.id, payload);
        setSuccessMessage('Finding updated successfully.');
      } else {
        await createInternalAuditFinding(auditId, payload);
        setSuccessMessage('Finding created successfully.');
      }

      setFindingModalOpen(false);
      setEditingFinding(null);
      setFindingForm(initialFindingForm);
      await refreshAll();
    } catch (err) {
      setFindingError(getErrorMessage(err));
    } finally {
      setSavingFinding(false);
    }
  }

  async function handleCloseFinding(e: FormEvent) {
    e.preventDefault();
    if (!selectedCloseFinding) return;

    try {
      setClosingFinding(true);
      setCloseFindingError(null);

      await closeInternalAuditFinding(auditId, selectedCloseFinding.id, {
        closure_notes: closeFindingForm.closure_notes.trim() || undefined,
      });

      setCloseFindingModalOpen(false);
      setSelectedCloseFinding(null);
      setCloseFindingForm(initialCloseFindingForm);
      setSuccessMessage('Finding closed successfully.');
      await refreshAll();
    } catch (err) {
      setCloseFindingError(getErrorMessage(err));
    } finally {
      setClosingFinding(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-10 shadow-sm">
            <p className="text-sm text-gray-500">Loading internal audit detail...</p>
          </div>
        </div>
      </main>
    );
  }

  if (pageError || !detail) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 shadow-sm">
            <p className="text-sm text-red-700">{pageError || 'Failed to load page.'}</p>
          </div>
        </div>
      </main>
    );
  }

  const { plan, summary } = detail;
  const isDraft = plan.status === 'DRAFT';
  const isInProgress = plan.status === 'IN_PROGRESS';
  const isCompleted = plan.status === 'COMPLETED';
  const isCancelled = plan.status === 'CANCELLED';
  const isReadOnly = isCompleted || isCancelled;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-10">

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
                Internal Audit Detail
              </p>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                  plan.status
                )}`}
              >
                {plan.status}
              </span>
            </div>

            <h1 className="mt-2 text-3xl font-semibold text-gray-900">
              {plan.audit_title}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {plan.audit_code} â€¢ {plan.audit_type}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/internal-audits"
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Back
            </Link>

            <button
              type="button"
              onClick={() => void refreshAll()}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Refresh
            </button>

            {isDraft ? (
              <button
                type="button"
                onClick={() => void handleStartAudit()}
                disabled={processingAction === 'start'}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {processingAction === 'start' ? 'Starting...' : 'Start Audit'}
              </button>
            ) : null}

            {isInProgress ? (
              <button
                type="button"
                onClick={() => void handleCompleteAudit()}
                disabled={processingAction === 'complete'}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {processingAction === 'complete' ? 'Completing...' : 'Complete Audit'}
              </button>
            ) : null}

            {!isCompleted && !isCancelled ? (
              <button
                type="button"
                onClick={() => {
                  setCancelError(null);
                  setCancelForm(initialCancelForm);
                  setCancelModalOpen(true);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
              >
                Cancel Audit
              </button>
            ) : null}

            {isDraft ? (
              <button
                type="button"
                onClick={() => setOverviewEditOpen((prev) => !prev)}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
              >
                {overviewEditOpen ? 'Close Edit' : 'Edit Overview'}
              </button>
            ) : null}
          </div>
        </div>

        {successMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {actionError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {actionError}
          </div>
        ) : null}

        {isReadOnly ? (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-700">
            {isCompleted
              ? 'This audit is completed. Structure editing and execution actions are locked.'
              : 'This audit is cancelled. The page is now read-only.'}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Members" value={summary.members_count} />
          <SummaryCard label="Sections" value={summary.sections_count} />
          <SummaryCard label="Checklist Items" value={summary.checklist_items_count} />
          <SummaryCard label="Open Findings" value={summary.open_findings_count} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Audit plan header and summary information.
                  </p>
                </div>
              </div>

              {!overviewEditOpen ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <OverviewField label="Audit Code" value={plan.audit_code} />
                  <OverviewField label="Audit Type" value={plan.audit_type} />
                  <OverviewField label="Status" value={plan.status} />
                  <OverviewField label="Lead Auditor" value={plan.lead_auditor_name || '-'} />
                  <OverviewField
                    label="Planned Start Date"
                    value={formatDate(plan.planned_start_date)}
                  />
                  <OverviewField
                    label="Planned End Date"
                    value={formatDate(plan.planned_end_date)}
                  />
                  <OverviewField
                    label="Actual Start Date"
                    value={formatDate(plan.actual_start_date)}
                  />
                  <OverviewField
                    label="Actual End Date"
                    value={formatDate(plan.actual_end_date)}
                  />
                  <OverviewField
                    className="md:col-span-2"
                    label="Objective"
                    value={plan.objective || '-'}
                    multiline
                  />
                  <OverviewField
                    className="md:col-span-2"
                    label="Scope Summary"
                    value={plan.scope_summary || '-'}
                    multiline
                  />
                  <OverviewField
                    className="md:col-span-2"
                    label="Auditee Summary"
                    value={plan.auditee_summary || '-'}
                    multiline
                  />
                  <OverviewField
                    className="md:col-span-2"
                    label="Notes"
                    value={plan.notes || '-'}
                    multiline
                  />
                </div>
              ) : (
                <form onSubmit={handleOverviewSave}>
                  {overviewError ? (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {overviewError}
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Audit Title
                      </label>
                      <input
                        value={overviewForm.audit_title}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            audit_title: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Audit Type
                      </label>
                      <select
                        value={overviewForm.audit_type}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            audit_type: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      >
                        <option value="INTERNAL">INTERNAL</option>
                        <option value="THEMATIC">THEMATIC</option>
                        <option value="PROCESS">PROCESS</option>
                        <option value="LOCATION">LOCATION</option>
                        <option value="FOLLOW_UP">FOLLOW_UP</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Lead Auditor
                      </label>
                      <select
                        value={overviewForm.lead_auditor_identity_id}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            lead_auditor_identity_id: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      >
                        <option value="">Keep current value</option>
                        {identities.map((identity) => (
                          <option key={String(identity.id)} value={String(identity.id)}>
                            {getIdentityLabel(identity)}
                            {identity.email ? ` (${identity.email})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Planned Start Date
                      </label>
                      <input
                        type="date"
                        value={overviewForm.planned_start_date}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            planned_start_date: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Planned End Date
                      </label>
                      <input
                        type="date"
                        value={overviewForm.planned_end_date}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            planned_end_date: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Objective
                      </label>
                      <textarea
                        rows={3}
                        value={overviewForm.objective}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            objective: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Scope Summary
                      </label>
                      <textarea
                        rows={3}
                        value={overviewForm.scope_summary}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            scope_summary: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Auditee Summary
                      </label>
                      <textarea
                        rows={2}
                        value={overviewForm.auditee_summary}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            auditee_summary: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Notes
                      </label>
                      <textarea
                        rows={2}
                        value={overviewForm.notes}
                        onChange={(e) =>
                          setOverviewForm((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setOverviewEditOpen(false)}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingOverview}
                      className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                      {savingOverview ? 'Saving...' : 'Save Overview'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Checklist Sections
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Organize checklist structure by clause or topic.
                  </p>
                </div>
                {isDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSection(null);
                      setSectionForm(initialSectionForm);
                      setSectionError(null);
                      setSectionModalOpen(true);
                    }}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Add Section
                  </button>
                ) : null}
              </div>

              {sections.length === 0 ? (
                <EmptyState
                  title="No sections yet"
                  description="Add the first checklist section to structure the audit checklist."
                />
              ) : (
                <div className="space-y-3">
                  {sections.map((section) => (
                    <div
                      key={String(section.id)}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-gray-900">
                              {section.title}
                            </h3>
                            {section.clause_code ? (
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                                Clause {section.clause_code}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm text-gray-600">
                            {section.description || '-'}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <span>Sort: {section.sort_order}</span>
                          {isDraft ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSection(section);
                                setSectionForm({
                                  title: section.title || '',
                                  description: section.description || '',
                                  clause_code: section.clause_code || '',
                                  sort_order: String(section.sort_order ?? 0),
                                });
                                setSectionError(null);
                                setSectionModalOpen(true);
                              }}
                              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Checklist Items</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Build and assess the checklist items used in the audit.
                  </p>
                </div>
                {isDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setItemForm(initialItemForm);
                      setItemError(null);
                      setItemModalOpen(true);
                    }}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Add Item
                  </button>
                ) : null}
              </div>

              {sortedItems.length === 0 ? (
                <EmptyState
                  title="No checklist items yet"
                  description="Add the first checklist item once your sections are ready."
                />
              ) : (
                <div className="space-y-3">
                  {sortedItems.map((item) => (
                    <div
                      key={String(item.id)}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
                                {item.item_code}
                              </span>
                              {item.section_id ? (
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-700">
                                  {item.section_title || `Section ${item.section_id}`}
                                </span>
                              ) : null}
                              {item.clause_code ? (
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-700">
                                  Clause {item.clause_code}
                                </span>
                              ) : null}
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  item.is_mandatory
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {item.is_mandatory ? 'Mandatory' : 'Optional'}
                              </span>
                            </div>

                            <p className="mt-3 text-sm font-medium text-gray-900">
                              {item.requirement_text}
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                              Expected evidence: {item.expected_evidence || '-'}
                            </p>
                            <p className="mt-2 text-xs text-gray-500">Sort: {item.sort_order}</p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {isDraft ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(item);
                                  setItemForm({
                                    section_id: item.section_id ? String(item.section_id) : '',
                                    item_code: item.item_code || '',
                                    requirement_text: item.requirement_text || '',
                                    expected_evidence: item.expected_evidence || '',
                                    clause_code: item.clause_code || '',
                                    sort_order: String(item.sort_order ?? 0),
                                    is_mandatory: item.is_mandatory,
                                  });
                                  setItemError(null);
                                  setItemModalOpen(true);
                                }}
                                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                            ) : null}

                            {isInProgress ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedResultItem(item);
                                  setResultForm({
                                    result_status: item.latest_result?.result_status || 'COMPLIANT',
                                    observation_notes:
                                      item.latest_result?.observation_notes || '',
                                    assessed_by_identity_id:
                                      item.latest_result?.assessed_by_identity_id
                                        ? String(item.latest_result.assessed_by_identity_id)
                                        : '',
                                  });
                                  setResultError(null);
                                  setResultModalOpen(true);
                                }}
                                className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                              >
                                {item.latest_result ? 'Update Result' : 'Record Result'}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Latest Result
                          </p>
                          {item.latest_result ? (
                            <div className="mt-2 space-y-2 text-sm text-gray-700">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">Status:</span>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resultBadgeClass(
                                    item.latest_result.result_status
                                  )}`}
                                >
                                  {item.latest_result.result_status}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium">Assessed By:</span>{' '}
                                {item.latest_result.assessed_by_name || '-'}
                              </div>
                              <div>
                                <span className="font-medium">Assessed At:</span>{' '}
                                {formatDateTime(item.latest_result.assessed_at)}
                              </div>
                              <div>
                                <span className="font-medium">Notes:</span>{' '}
                                {item.latest_result.observation_notes || '-'}
                              </div>
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-gray-500">
                              No result recorded yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Findings</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Record, track, update, and close internal audit findings.
                  </p>
                </div>

                {isInProgress ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFinding(null);
                      setFindingForm(initialFindingForm);
                      setFindingError(null);
                      setFindingModalOpen(true);
                    }}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Add Finding
                  </button>
                ) : null}
              </div>

              {findings.length > 0 ? (
                <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="md:col-span-1">
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Search
                      </label>
                      <input
                        value={findingFilters.q}
                        onChange={(e) =>
                          setFindingFilters((prev) => ({
                            ...prev,
                            q: e.target.value,
                          }))
                        }
                        placeholder="Search code or title"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Status
                      </label>
                      <select
                        value={findingFilters.status}
                        onChange={(e) =>
                          setFindingFilters((prev) => ({
                            ...prev,
                            status: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="OPEN">OPEN</option>
                        <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Severity
                      </label>
                      <select
                        value={findingFilters.severity}
                        onChange={(e) =>
                          setFindingFilters((prev) => ({
                            ...prev,
                            severity: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                      >
                        <option value="ALL">All Severities</option>
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-gray-600">
                      Showing {filteredFindings.length} of {findings.length} findings.
                    </p>

                    {hasActiveFindingFilters ? (
                      <button
                        type="button"
                        onClick={() => setFindingFilters(initialFindingFilters)}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Clear Filters
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {findings.length === 0 ? (
                <EmptyState
                  title="No findings yet"
                  description="Create findings during audit execution when gaps or issues are identified."
                />
              ) : filteredFindings.length === 0 ? (
                <EmptyState
                  title="No findings match the current filters"
                  description="Adjust the search text, status, or severity filter to see more results."
                />
              ) : (
                <div className="space-y-3">
                  {filteredFindings.map((finding) => (
                    <div
                      key={String(finding.id)}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
                                {finding.finding_code}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${findingSeverityClass(
                                  finding.severity
                                )}`}
                              >
                                {finding.severity}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                                  finding.status
                                )}`}
                              >
                                {finding.status}
                              </span>
                            </div>

                            <p className="mt-3 text-sm font-semibold text-gray-900">
                              {finding.title}
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                              {finding.description}
                            </p>

                            <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                              <div>
                                <span className="font-medium">Owner:</span>{' '}
                                {finding.owner_name || '-'}
                              </div>
                              <div>
                                <span className="font-medium">Due Date:</span>{' '}
                                {formatDate(finding.due_date)}
                              </div>
                              <div>
                                <span className="font-medium">Checklist Item:</span>{' '}
                                {finding.checklist_item_id || '-'}
                              </div>
                              <div>
                                <span className="font-medium">Closed At:</span>{' '}
                                {formatDateTime(finding.closed_at)}
                              </div>
                            </div>

                            {finding.closure_notes ? (
                              <div className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                                <span className="font-medium">Closure Notes:</span>{' '}
                                {finding.closure_notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {finding.status !== 'CLOSED' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingFinding(finding);
                                    setFindingForm({
                                      checklist_item_id: finding.checklist_item_id
                                        ? String(finding.checklist_item_id)
                                        : '',
                                      finding_code: finding.finding_code || '',
                                      title: finding.title || '',
                                      description: finding.description || '',
                                      severity: finding.severity || 'LOW',
                                      owner_identity_id: finding.owner_identity_id
                                        ? String(finding.owner_identity_id)
                                        : '',
                                      due_date: finding.due_date || '',
                                    });
                                    setFindingError(null);
                                    setFindingModalOpen(true);
                                  }}
                                  className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCloseFinding(finding);
                                    setCloseFindingForm(initialCloseFindingForm);
                                    setCloseFindingError(null);
                                    setCloseFindingModalOpen(true);
                                  }}
                                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                                >
                                  Close Finding
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Members</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Assign lead auditor, auditors, auditee, and observers.
                  </p>
                </div>
                {isDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMemberError(null);
                      setMemberActionError(null);
                      setMemberForm(initialMemberForm);
                      setMemberModalOpen(true);
                    }}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Add Member
                  </button>
                ) : null}
              </div>

              {memberActionError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {memberActionError}
                </div>
              ) : null}

              {members.length === 0 ? (
                <EmptyState
                  title="No members yet"
                  description="Add at least the lead auditor and audit team before execution."
                />
              ) : (
                <div className="space-y-3">
                  {members.map((member) => {
                    const isDeletingThisMember =
                      deletingMemberId !== null &&
                      String(deletingMemberId) === String(member.id);

                    return (
                      <div
                        key={String(member.id)}
                        className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">
                              {member.identity_name || '-'}
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              {member.identity_email || '-'}
                            </p>
                            {member.notes ? (
                              <p className="mt-2 text-sm text-gray-600">{member.notes}</p>
                            ) : null}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
                              {member.member_role}
                            </span>

                            {isDraft ? (
                              <button
                                type="button"
                                onClick={() => void handleDeleteMember(member)}
                                disabled={deletingMemberId !== null}
                                className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isDeletingThisMember ? 'Removing...' : 'Remove'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Execution Guidance</h2>
              <p className="mt-2 text-sm text-gray-600">
                Draft phase is for structure. In progress phase is for result capture and
                findings. Completed phase is read-focused and closure-oriented.
              </p>
            </div>
          </div>
        </div>

        {memberModalOpen ? (
          <ModalShell
            title="Add Audit Member"
            description="Add a member to the internal audit plan."
            onClose={() => setMemberModalOpen(false)}
          >
            <form onSubmit={handleAddMember}>
              {memberError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {memberError}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Identity
                  </label>
                  <select
                    value={memberForm.identity_id}
                    onChange={(e) =>
                      setMemberForm((prev) => ({ ...prev, identity_id: e.target.value }))
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="">Select identity</option>
                    {identities.map((identity) => (
                      <option key={String(identity.id)} value={String(identity.id)}>
                        {getIdentityLabel(identity)}
                        {identity.email ? ` (${identity.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Member Role
                  </label>
                  <select
                    value={memberForm.member_role}
                    onChange={(e) =>
                      setMemberForm((prev) => ({ ...prev, member_role: e.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="LEAD_AUDITOR">LEAD_AUDITOR</option>
                    <option value="AUDITOR">AUDITOR</option>
                    <option value="AUDITEE">AUDITEE</option>
                    <option value="OBSERVER">OBSERVER</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={memberForm.notes}
                    onChange={(e) =>
                      setMemberForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingMember ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          </ModalShell>
        ) : null}

        {sectionModalOpen ? (
          <ModalShell
            title={editingSection ? 'Edit Checklist Section' : 'Add Checklist Section'}
            description="Maintain checklist section structure for this audit."
            onClose={() => {
              setSectionModalOpen(false);
              setEditingSection(null);
            }}
          >
            <form onSubmit={handleSaveSection}>
              {sectionError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {sectionError}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    value={sectionForm.title}
                    onChange={(e) =>
                      setSectionForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Clause Code
                  </label>
                  <input
                    value={sectionForm.clause_code}
                    onChange={(e) =>
                      setSectionForm((prev) => ({
                        ...prev,
                        clause_code: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={sectionForm.sort_order}
                    onChange={(e) =>
                      setSectionForm((prev) => ({
                        ...prev,
                        sort_order: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={sectionForm.description}
                    onChange={(e) =>
                      setSectionForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSectionModalOpen(false);
                    setEditingSection(null);
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSection}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingSection ? 'Saving...' : editingSection ? 'Save Section' : 'Add Section'}
                </button>
              </div>
            </form>
          </ModalShell>
        ) : null}

        {itemModalOpen ? (
          <ModalShell
            title={editingItem ? 'Edit Checklist Item' : 'Add Checklist Item'}
            description="Maintain checklist item structure for this audit."
            onClose={() => {
              setItemModalOpen(false);
              setEditingItem(null);
            }}
          >
            <form onSubmit={handleSaveItem}>
              {itemError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {itemError}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Section
                  </label>
                  <select
                    value={itemForm.section_id}
                    onChange={(e) =>
                      setItemForm((prev) => ({ ...prev, section_id: e.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="">No section</option>
                    {sections.map((section) => (
                      <option key={String(section.id)} value={String(section.id)}>
                        {section.title}
                        {section.clause_code ? ` (Clause ${section.clause_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Item Code
                  </label>
                  <input
                    value={itemForm.item_code}
                    onChange={(e) =>
                      setItemForm((prev) => ({ ...prev, item_code: e.target.value }))
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Requirement Text
                  </label>
                  <textarea
                    rows={4}
                    value={itemForm.requirement_text}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        requirement_text: e.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Expected Evidence
                  </label>
                  <textarea
                    rows={3}
                    value={itemForm.expected_evidence}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        expected_evidence: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Clause Code
                    </label>
                    <input
                      value={itemForm.clause_code}
                      onChange={(e) =>
                        setItemForm((prev) => ({
                          ...prev,
                          clause_code: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Sort Order
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={itemForm.sort_order}
                      onChange={(e) =>
                        setItemForm((prev) => ({
                          ...prev,
                          sort_order: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={itemForm.is_mandatory}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        is_mandatory: e.target.checked,
                      }))
                    }
                  />
                  Mandatory item
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setItemModalOpen(false);
                    setEditingItem(null);
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingItem ? 'Saving...' : editingItem ? 'Save Item' : 'Add Item'}
                </button>
              </div>
            </form>
          </ModalShell>
        ) : null}

        {resultModalOpen ? (
          <ModalShell
            title="Record Checklist Result"
            description={
              selectedResultItem
                ? `Record result for ${selectedResultItem.item_code}`
                : 'Record checklist result'
            }
            onClose={() => {
              setResultModalOpen(false);
              setSelectedResultItem(null);
            }}
          >
            <form onSubmit={handleSaveResult}>
              {resultError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {resultError}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Result Status
                  </label>
                  <select
                    value={resultForm.result_status}
                    onChange={(e) =>
                      setResultForm((prev) => ({
                        ...prev,
                        result_status: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="COMPLIANT">COMPLIANT</option>
                    <option value="NONCOMPLIANT">NONCOMPLIANT</option>
                    <option value="OBSERVATION">OBSERVATION</option>
                    <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Assessed By Identity
                  </label>
                  <select
                    value={resultForm.assessed_by_identity_id}
                    onChange={(e) =>
                      setResultForm((prev) => ({
                        ...prev,
                        assessed_by_identity_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="">No identity</option>
                    {identities.map((identity) => (
                      <option key={String(identity.id)} value={String(identity.id)}>
                        {getIdentityLabel(identity)}
                        {identity.email ? ` (${identity.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Observation Notes
                  </label>
                  <textarea
                    rows={4}
                    value={resultForm.observation_notes}
                    onChange={(e) =>
                      setResultForm((prev) => ({
                        ...prev,
                        observation_notes: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setResultModalOpen(false);
                    setSelectedResultItem(null);
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingResult}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingResult ? 'Saving...' : 'Save Result'}
                </button>
              </div>
            </form>
          </ModalShell>
        ) : null}

        {findingModalOpen ? (
          <ModalShell
            title={editingFinding ? 'Edit Finding' : 'Add Finding'}
            description="Create or update an internal audit finding."
            onClose={() => {
              setFindingModalOpen(false);
              setEditingFinding(null);
            }}
          >
            <form onSubmit={handleSaveFinding}>
              {findingError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {findingError}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Checklist Item
                  </label>
                  <select
                    value={findingForm.checklist_item_id}
                    onChange={(e) =>
                      setFindingForm((prev) => ({
                        ...prev,
                        checklist_item_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="">No checklist item</option>
                    {items.map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {item.item_code} - {item.requirement_text}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Finding Code
                  </label>
                  <input
                    value={findingForm.finding_code}
                    onChange={(e) =>
                      setFindingForm((prev) => ({
                        ...prev,
                        finding_code: e.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    value={findingForm.title}
                    onChange={(e) =>
                      setFindingForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={findingForm.description}
                    onChange={(e) =>
                      setFindingForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Severity
                    </label>
                    <select
                      value={findingForm.severity}
                      onChange={(e) =>
                        setFindingForm((prev) => ({
                          ...prev,
                          severity: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={findingForm.due_date}
                      onChange={(e) =>
                        setFindingForm((prev) => ({
                          ...prev,
                          due_date: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Owner Identity
                  </label>
                  <select
                    value={findingForm.owner_identity_id}
                    onChange={(e) =>
                      setFindingForm((prev) => ({
                        ...prev,
                        owner_identity_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="">No owner</option>
                    {identities.map((identity) => (
                      <option key={String(identity.id)} value={String(identity.id)}>
                        {getIdentityLabel(identity)}
                        {identity.email ? ` (${identity.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFindingModalOpen(false);
                    setEditingFinding(null);
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFinding}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingFinding ? 'Saving...' : editingFinding ? 'Save Finding' : 'Add Finding'}
                </button>
              </div>
            </form>
          </ModalShell>
        ) : null}

        {closeFindingModalOpen ? (
          <ModalShell
            title="Close Finding"
            description="Provide closure notes before closing this finding."
            onClose={() => {
              setCloseFindingModalOpen(false);
              setSelectedCloseFinding(null);
            }}
          >
            <form onSubmit={handleCloseFinding}>
              {closeFindingError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {closeFindingError}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Closure Notes
                </label>
                <textarea
                  rows={4}
                  value={closeFindingForm.closure_notes}
                  onChange={(e) =>
                    setCloseFindingForm((prev) => ({
                      ...prev,
                      closure_notes: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCloseFindingModalOpen(false);
                    setSelectedCloseFinding(null);
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closingFinding}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {closingFinding ? 'Closing...' : 'Close Finding'}
                </button>
              </div>
            </form>
          </ModalShell>
        ) : null}

        {cancelModalOpen ? (
          <ModalShell
            title="Cancel Audit"
            description="Provide optional notes before cancelling the audit."
            onClose={() => setCancelModalOpen(false)}
          >
            <form onSubmit={handleCancelAudit}>
              {cancelError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {cancelError}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Cancellation Notes
                </label>
                <textarea
                  rows={4}
                  value={cancelForm.notes}
                  onChange={(e) =>
                    setCancelForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={cancellingAudit}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {cancellingAudit ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </ModalShell>
        ) : null}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function OverviewField({
  label,
  value,
  multiline = false,
  className = '',
}: {
  label: string;
  value: string;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p
        className={`mt-1 text-sm text-gray-900 ${
          multiline ? 'whitespace-pre-wrap leading-6' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-600">{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
