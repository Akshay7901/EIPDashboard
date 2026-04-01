import React, { useState, useEffect, useMemo } from "react";
import { Check, CheckCircle2, Plus, Trash2, Loader2, MessageSquare, ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { extractCountry } from "@/lib/extractCountry";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { metadataApi, metadataQueriesApi, type ProposalMetadata, type MetadataAuthor, type MetadataQuery } from "@/lib/proposalsApi";
import MetadataQueryDiffPanel from "@/components/proposals/MetadataQueryDiffPanel";
import type { Proposal } from "@/types";

interface PublicationMetadataProps {
  proposal: Proposal;
  contractSigned?: boolean;
  authorChanges?: Record<string, { old: string; new: string }>;
  ticketNumber: string;
}

interface EditableRowProps {
  label: string;
  sublabel?: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  type?: "text" | "email" | "textarea";
  authorChange?: { old: string; new: string } | null;
}

const EditableRow: React.FC<EditableRowProps> = ({
  label,
  sublabel,
  value,
  onChange,
  disabled,
  type = "text",
  authorChange,
}) => (
  <div className="grid grid-cols-[200px_1fr] border-b border-border">
    <div className="py-3 px-4 text-sm font-medium text-muted-foreground bg-muted/30">
      {label}
      {sublabel && (
        <span className="block text-xs font-normal text-muted-foreground/60">
          {sublabel}
        </span>
      )}
    </div>
    <div className="py-2 px-4 flex flex-col gap-1">
      {authorChange && (
        <div className="text-sm mb-1">
          <span className="line-through text-foreground">{authorChange.old}</span>{" "}
          <span className="text-destructive font-medium">{authorChange.new}</span>
        </div>
      )}
      {type === "textarea" ? (
        <Textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }
          }}
          disabled={disabled}
          className={`resize-none overflow-hidden ${disabled ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : ""}`}
          rows={1}
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={disabled ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : ""}
        />
      )}
    </div>
  </div>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="bg-[#3d5a47] text-white py-2.5 px-4">
    <p className="text-sm font-semibold uppercase tracking-wide">{title}</p>
  </div>
);

interface AdditionalPerson {
  id: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
}

const PublicationMetadata: React.FC<PublicationMetadataProps> = ({
  proposal,
  contractSigned,
  authorChanges = {},
  ticketNumber,
}) => {
  const queryClient = useQueryClient();

  // Fetch metadata from API
  const { data: metadataResponse, isLoading } = useQuery({
    queryKey: ["metadata", ticketNumber],
    queryFn: () => metadataApi.get(ticketNumber),
    enabled: !!ticketNumber,
  });

  // Fetch metadata queries
  const { data: metadataQueries = [] } = useQuery({
    queryKey: ["metadata-queries", ticketNumber],
    queryFn: () => metadataQueriesApi.list(ticketNumber),
    enabled: !!ticketNumber,
  });

  const apiMeta = metadataResponse?.metadata;
  const metadataStatus = metadataResponse?.metadata_status;
  const isSentToAuthor = metadataStatus === "sent_to_author";
  const isApproved = metadataStatus === "approved";

  // Check for pending (unanswered) queries from author
  const pendingQueries = useMemo(() =>
    metadataQueries.filter(
      (q) => q.type === 'query' && !metadataQueries.some((r) => r.type === 'response' && r.parent_query_id === q.id)
    ), [metadataQueries]);
  const hasPendingQueries = pendingQueries.length > 0;

  // Form is editable when not sent OR when there are pending queries to address; always locked when approved
  const isFormDisabled = isApproved || (isSentToAuthor && !hasPendingQueries);
  // Fallback values from proposal
  const country = extractCountry(proposal.address) || proposal.country || "";
  const fullName = proposal.corresponding_author_name || proposal.author_name || "";
  const nameParts = fullName.trim().split(/\s+/);
  const titlePrefixes = ["dr.", "prof.", "mr.", "mrs.", "ms.", "dr", "prof"];
  let detectedTitle = "";
  let firstNameParts = [...nameParts];
  if (nameParts.length > 1 && titlePrefixes.includes(nameParts[0].toLowerCase())) {
    detectedTitle = nameParts[0];
    firstNameParts = nameParts.slice(1);
  }
  const detectedLast = firstNameParts.length > 1 ? firstNameParts.pop() || "" : "";
  const detectedFirst = firstNameParts.join(" ");

  const primaryAuthor = apiMeta?.authors?.[0];

  // Editable form state - prefer API data, fallback to proposal
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [categoryAuthEd, setCategoryAuthEd] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayBio, setDisplayBio] = useState("");
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [email2, setEmail2] = useState("");
  const [institution, setInstitution] = useState("");
  const [countryVal, setCountryVal] = useState("");
  const [bookDesc, setBookDesc] = useState("");
  const [keywords, setKeywords] = useState("");

  // Additional authors/editors
  const [additionalPeople, setAdditionalPeople] = useState<AdditionalPerson[]>([]);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [respondingLoading, setRespondingLoading] = useState(false);
  const [showRespondDialog, setShowRespondDialog] = useState(false);
  const [dialogResponses, setDialogResponses] = useState<Record<number, string>>({});

  // Field map for diff panel - maps normalized field keys to labels and current values
  const isAuthorType = (categoryAuthEd || "").toLowerCase().includes("author");
  const additionalLabel = isAuthorType ? "Author" : "Editor";

  const fieldMap = useMemo(() => {
    const base: Record<string, { label: string; currentValue: string }> = {
      title: { label: "Title", currentValue: title },
      subtitle: { label: "Subtitle", currentValue: subtitle },
      category_auth_ed: { label: "Category Auth/Ed", currentValue: categoryAuthEd },
      display_name_s_: { label: "Display Name(s)", currentValue: displayName },
      display_names: { label: "Display Name(s)", currentValue: displayName },
      display_bio_s_: { label: "Display bio(s)", currentValue: displayBio },
      display_bios: { label: "Display bio(s)", currentValue: displayBio },
      salutation: { label: "Salutation", currentValue: salutation },
      first_name: { label: "First name", currentValue: firstName },
      last_name: { label: "Last name", currentValue: lastName },
      email: { label: "Email", currentValue: email },
      email_2: { label: "Email 2", currentValue: email2 },
      institution: { label: "Institution", currentValue: institution },
      country: { label: "Country", currentValue: countryVal },
      book_description: { label: "Book description", currentValue: bookDesc },
      keywords_tags: { label: "Keywords/Tags", currentValue: keywords },
      keywords: { label: "Keywords/Tags", currentValue: keywords },
    };

    // Add dynamic additional editor/author fields
    additionalPeople.forEach((person, idx) => {
      const num = idx + 1;
      const prefix = `additional_${additionalLabel.toLowerCase()}_${num}`;
      base[`${prefix}_-_salutation`] = { label: `Additional ${additionalLabel} ${num} - Salutation`, currentValue: person.salutation };
      base[`${prefix}_-_first_name`] = { label: `Additional ${additionalLabel} ${num} - First name`, currentValue: person.firstName };
      base[`${prefix}_-_last_name`] = { label: `Additional ${additionalLabel} ${num} - Last name`, currentValue: person.lastName };
      base[`${prefix}_-_email`] = { label: `Additional ${additionalLabel} ${num} - Email`, currentValue: person.email };
    });

    return base;
  }, [title, subtitle, categoryAuthEd, displayName, displayBio, salutation, firstName, lastName, email, email2, institution, countryVal, bookDesc, keywords, additionalPeople, additionalLabel]);

  // Apply a field value from a query diff
  const handleApplyField = (fieldKey: string, value: string) => {
    const setters: Record<string, (v: string) => void> = {
      title: setTitle,
      subtitle: setSubtitle,
      category_auth_ed: setCategoryAuthEd,
      display_name_s_: setDisplayName,
      display_names: setDisplayName,
      display_bio_s_: setDisplayBio,
      display_bios: setDisplayBio,
      salutation: setSalutation,
      first_name: setFirstName,
      last_name: setLastName,
      email: setEmail,
      email_2: setEmail2,
      institution: setInstitution,
      country: setCountryVal,
      book_description: setBookDesc,
      keywords_tags: setKeywords,
      keywords: setKeywords,
    };
    const setter = setters[fieldKey];
    if (setter) {
      setter(value);
      return;
    }

    // Handle additional editor/author fields (e.g. additional_editor_1_-_first_name)
    const additionalMatch = fieldKey.match(/^additional_(?:editor|author)_(\d+)_-_(.+)$/);
    if (additionalMatch) {
      const idx = parseInt(additionalMatch[1], 10) - 1;
      const subField = additionalMatch[2];
      const fieldToKey: Record<string, keyof AdditionalPerson> = {
        salutation: "salutation",
        first_name: "firstName",
        last_name: "lastName",
        email: "email",
      };
      const personKey = fieldToKey[subField];
      if (personKey && idx >= 0 && idx < additionalPeople.length) {
        setAdditionalPeople(prev => prev.map((p, i) =>
          i === idx ? { ...p, [personKey]: value } : p
        ));
      }
    }
  };

  const handleRespondToQuery = async (queryId: number, text: string) => {
    setRespondingLoading(true);
    try {
      await metadataQueriesApi.respond(ticketNumber, queryId, text);
      queryClient.invalidateQueries({ queryKey: ["metadata-queries", ticketNumber] });
      toast({ title: "Response sent" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message || "Could not send response.", variant: "destructive" });
    } finally {
      setRespondingLoading(false);
    }
  };

  // Populate form when API data loads
  useEffect(() => {
    if (apiMeta) {
      setTitle(apiMeta.title || proposal.name || "");
      setSubtitle(apiMeta.subtitle || proposal.sub_title || "");
      setCategoryAuthEd(apiMeta.category || proposal.book_type || "Author");
      setDisplayName(apiMeta.display_names || fullName);
      setDisplayBio(apiMeta.display_bios || proposal.biography || "");
      setSalutation(primaryAuthor?.title || detectedTitle || "");
      setFirstName(primaryAuthor?.first_name || detectedFirst);
      setLastName(primaryAuthor?.last_name || detectedLast);
      setEmail(primaryAuthor?.email || proposal.author_email || "");
      setEmail2(primaryAuthor?.email_2 || proposal.secondary_email || "");
      setInstitution(primaryAuthor?.institution || proposal.institution || "");
      setCountryVal(primaryAuthor?.country || country);
      setBookDesc(apiMeta.book_description || proposal.short_description || "");
      setKeywords(apiMeta.keywords || proposal.keywords || "");

      // Load additional authors (skip first which is primary)
      if (apiMeta.authors && apiMeta.authors.length > 1) {
        setAdditionalPeople(
          apiMeta.authors.slice(1).map((a) => ({
            id: crypto.randomUUID(),
            salutation: a.title || "",
            firstName: a.first_name || "",
            lastName: a.last_name || "",
            email: a.email || "",
          }))
        );
      }
    } else if (!isLoading) {
      // No API data yet, use proposal fallbacks
      setTitle(proposal.name || "");
      setSubtitle(proposal.sub_title || "");
      setCategoryAuthEd(proposal.book_type || "Author");
      setDisplayName(fullName);
      setDisplayBio(proposal.biography || "");
      setSalutation(detectedTitle || "");
      setFirstName(detectedFirst);
      setLastName(detectedLast);
      setEmail(proposal.author_email || "");
      setEmail2(proposal.secondary_email || "");
      setInstitution(proposal.institution || "");
      setCountryVal(country);
      setBookDesc(proposal.short_description || "");
      setKeywords(proposal.keywords || "");
    }
  }, [apiMeta, isLoading]);

  const addPerson = () => {
    setAdditionalPeople((prev) => [
      ...prev,
      { id: crypto.randomUUID(), salutation: "", firstName: "", lastName: "", email: "" },
    ]);
  };

  const removePerson = (id: string) => {
    setAdditionalPeople((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePerson = (id: string, field: keyof AdditionalPerson, value: string) => {
    setAdditionalPeople((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  // Title Full auto-computed
  const titleFull = [title, subtitle].filter(Boolean).join(": ");

  // Build payload for API
  const buildPayload = (): Partial<ProposalMetadata> => {
    const authors: MetadataAuthor[] = [
      {
        title: salutation,
        first_name: firstName,
        last_name: lastName,
        email,
        email_2: email2,
        institution,
        country: countryVal,
      },
      ...additionalPeople.map((p) => ({
        title: p.salutation,
        first_name: p.firstName,
        last_name: p.lastName,
        email: p.email,
      })),
    ];

    return {
      title,
      subtitle,
      full_title: titleFull,
      category: categoryAuthEd,
      display_names: displayName,
      display_bios: displayBio,
      authors,
      book_description: bookDesc,
      keywords,
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await metadataApi.update(ticketNumber, { ...buildPayload(), notes: "Draft saved" });
      queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });
      toast({ title: "Publication Data saved", description: "Your changes have been saved." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "Could not save metadata.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToAuthorClick = () => {
    if (hasPendingQueries) {
      // Initialize dialog responses for each pending query
      const initial: Record<number, string> = {};
      pendingQueries.forEach((q) => { initial[q.id] = ""; });
      setDialogResponses(initial);
      setShowRespondDialog(true);
    } else {
      handleSubmitToAuthor();
    }
  };

  const handleSubmitToAuthor = async () => {
    setSubmitting(true);
    try {
      await metadataApi.update(ticketNumber, { ...buildPayload(), notes: "Submitted to author for finalization" });
      await metadataApi.send(ticketNumber);
      queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });
      toast({ title: "Sent to Author", description: "Publication data has been sent to the author for approval." });
    } catch (err: any) {
      toast({ title: "Submit failed", description: err?.message || "Could not send publication data to author.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespondAndSubmit = async () => {
    setSubmitting(true);
    try {
      // 1. Respond to all pending queries
      for (const q of pendingQueries) {
        const text = dialogResponses[q.id]?.trim();
        if (text) {
          await metadataQueriesApi.respond(ticketNumber, q.id, text);
        }
      }
      // 2. Save & submit to author
      await metadataApi.update(ticketNumber, { ...buildPayload(), notes: "Submitted to author for finalization" });
      await metadataApi.send(ticketNumber);
      queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });
      queryClient.invalidateQueries({ queryKey: ["metadata-queries", ticketNumber] });
      setShowRespondDialog(false);
      toast({ title: "Sent to Author", description: "Queries responded and publication data sent to author." });
    } catch (err: any) {
      toast({ title: "Submit failed", description: err?.message || "Could not complete.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const allDialogResponsesFilled = pendingQueries.every((q) => dialogResponses[q.id]?.trim());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading metadata...</span>
      </div>
    );
  }

  const sectionLabel = "Primary Author(s)";
  const addButtonLabel = "Add an author or editor";

   return (
    <div className="space-y-4">

      {isApproved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <Check className="h-4 w-4" />
          Publication data has been approved. No further changes can be made.
        </div>
      )}

      {isFormDisabled && !isApproved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800">
          Publication data has been sent to the author for approval. Editing is disabled until the author responds or you need to make changes.
        </div>
      )}

      {hasPendingQueries && isSentToAuthor && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          The author has raised queries about the publication data. Review the changes below, update fields as needed, respond to the query, then re-send to the author.
        </div>
      )}

      {/* Metadata Queries - Diff Panel (shown at top for visibility) */}
      {metadataQueries.length > 0 && (
        <div className="space-y-3">
          {/* Pending queries with diff */}
          {pendingQueries.map((q) => (
            <MetadataQueryDiffPanel
              key={q.id}
              query={q}
              fieldMap={fieldMap}
              onApplyField={handleApplyField}
              onRespond={handleRespondToQuery}
              respondingLoading={respondingLoading}
              hasResponse={false}
            />
          ))}

          {/* Responded queries (collapsed) */}
          {metadataQueries
            .filter((q) => q.type === 'query' && metadataQueries.some((r) => r.type === 'response' && r.parent_query_id === q.id))
            .map((q) => {
              const response = metadataQueries.find((r) => r.type === 'response' && r.parent_query_id === q.id);
              return (
                <div key={q.id} className="border border-border rounded-lg overflow-hidden opacity-70">
                  <div className="px-4 py-2 bg-muted/30 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Query from {q.raised_by_name || q.raised_by} — {new Date(q.created_at).toLocaleString()}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">Responded</Badge>
                  </div>
                  <div className="px-4 py-2 text-sm whitespace-pre-line border-b border-border" dangerouslySetInnerHTML={{ __html: (q.text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
                  {response && (
                    <div className="px-4 py-2 text-sm bg-emerald-50/50 whitespace-pre-line">
                      <span className="text-xs font-medium text-emerald-700">Your response: </span>
                      {response.text}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <div className="space-y-0 border border-border rounded-lg overflow-hidden">
        {/* Publication Metadata header */}

        {/* Title Full - non-editable, greyed out */}
        <EditableRow label="Title Full" value={titleFull} onChange={() => {}} disabled authorChange={authorChanges["title_full"] || null} />

        <EditableRow label="Title" value={title} onChange={setTitle} disabled={isFormDisabled} authorChange={authorChanges["title"] || null} />
        <EditableRow label="Subtitle" value={subtitle} onChange={setSubtitle} disabled={isFormDisabled} authorChange={authorChanges["subtitle"] || null} />
        <EditableRow label="Category Auth/Ed" value={categoryAuthEd} onChange={setCategoryAuthEd} disabled={isFormDisabled} authorChange={authorChanges["category"] || null} />

        {/* Primary Author(s) */}
        <SectionHeader title={sectionLabel} />

        <EditableRow label="Display Name(s)" value={displayName} onChange={setDisplayName} disabled={isFormDisabled} authorChange={authorChanges["display_name"] || null} />
        <EditableRow label="Display bio(s)" value={displayBio} onChange={setDisplayBio} type="textarea" disabled={isFormDisabled} authorChange={authorChanges["display_bio"] || null} />
        <EditableRow label="Salutation" value={salutation} onChange={setSalutation} disabled={isFormDisabled} authorChange={authorChanges["salutation"] || null} />
        <EditableRow label="First name" value={firstName} onChange={setFirstName} disabled={isFormDisabled} authorChange={authorChanges["first_name"] || null} />
        <EditableRow label="Last name" value={lastName} onChange={setLastName} disabled={isFormDisabled} authorChange={authorChanges["last_name"] || null} />
        <EditableRow label="Email" value={email} onChange={setEmail} type="email" disabled={isFormDisabled} authorChange={authorChanges["email"] || null} />
        <EditableRow label="Email 2" value={email2} onChange={setEmail2} type="email" disabled={isFormDisabled} authorChange={authorChanges["email_2"] || null} />
        <EditableRow label="Institution" value={institution} onChange={setInstitution} disabled={isFormDisabled} authorChange={authorChanges["institution"] || null} />
        <EditableRow label="Country" value={countryVal} onChange={setCountryVal} disabled={isFormDisabled} authorChange={authorChanges["country"] || null} />

        {/* Additional authors/editors */}
        {additionalPeople.map((person, idx) => (
          <React.Fragment key={person.id}>
            <div className="bg-muted/50 py-2 px-4 flex items-center justify-between border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Additional Author {idx + 1}
              </p>
              {!isFormDisabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => removePerson(person.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <EditableRow label="Salutation" value={person.salutation} onChange={(v) => updatePerson(person.id, "salutation", v)} disabled={isFormDisabled} />
            <EditableRow label="First name" value={person.firstName} onChange={(v) => updatePerson(person.id, "firstName", v)} disabled={isFormDisabled} />
            <EditableRow label="Last name" value={person.lastName} onChange={(v) => updatePerson(person.id, "lastName", v)} disabled={isFormDisabled} />
            <EditableRow label="Email" value={person.email} onChange={(v) => updatePerson(person.id, "email", v)} type="email" disabled={isFormDisabled} />
          </React.Fragment>
        ))}

        {!isFormDisabled && (
          <div className="px-4 py-3 border-b border-border">
            <Button variant="outline" size="sm" onClick={addPerson} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {addButtonLabel}
            </Button>
          </div>
        )}

        {/* Book Information */}
        <SectionHeader title="Book Information" />

        <EditableRow label="Book description" sublabel="(max 2000 characters)" value={bookDesc} onChange={setBookDesc} type="textarea" disabled={isFormDisabled} authorChange={authorChanges["book_description"] || null} />
        <EditableRow label="Keywords/Tags" value={keywords} onChange={setKeywords} type="textarea" disabled={isFormDisabled} authorChange={authorChanges["keywords"] || null} />

        {/* Cover Image Section */}
        <SectionHeader title="Cover Image" />
        <div className="p-4">
          {metadataResponse?.cover_image ? (
            <div className="flex items-start gap-4">
              <div className="relative w-32 h-44 rounded-md overflow-hidden border-2 border-border">
                <img src={metadataResponse.cover_image.s3_url} alt="Cover" className="w-full h-full object-cover" />
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">File:</span> {metadataResponse.cover_image.filename}</p>
                <p><span className="font-medium text-foreground">Dimensions:</span> {metadataResponse.cover_image.width_px} × {metadataResponse.cover_image.height_px}px</p>
                <p><span className="font-medium text-foreground">DPI:</span> {metadataResponse.cover_image.dpi}</p>
                <p><span className="font-medium text-foreground">Size:</span> {(metadataResponse.cover_image.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</p>
                <p><span className="font-medium text-foreground">Uploaded:</span> {new Date(metadataResponse.cover_image.uploaded_at).toLocaleDateString()}</p>
                {metadataResponse.cover_image.source && (
                  <p><span className="font-medium text-foreground">Image Source / Credit:</span> {metadataResponse.cover_image.source}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              No cover image uploaded
            </div>
          )}
        </div>

      </div>


      {/* Action buttons - show when form is editable */}
      {!isFormDisabled && !isApproved && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="outline"
            className="px-8"
            disabled={saving}
            onClick={handleSaveDraft}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Draft
          </Button>
          <Button
            className="bg-[#2f4b40] hover:opacity-90 text-white px-6"
            disabled={submitting}
            onClick={handleSubmitToAuthorClick}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Submit to Author for Finalization
          </Button>
        </div>
      )}

      {/* Respond & Submit Dialog */}
      <Dialog open={showRespondDialog} onOpenChange={setShowRespondDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-amber-600" />
              Respond to Author Queries
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Please respond to the author's queries before submitting the publication Data.
            </p>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto py-2">
            {pendingQueries.map((q) => (
              <div key={q.id} className="border border-amber-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
                  <p className="text-xs font-medium text-amber-800">
                    Query from {q.raised_by_name || q.raised_by}
                  </p>
                  <p className="text-sm mt-1 whitespace-pre-line" dangerouslySetInnerHTML={{ __html: (q.text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
                  {q.fields && q.fields.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {q.fields.map((f: string) => (
                        <span key={f} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <Textarea
                    placeholder="Type your response..."
                    value={dialogResponses[q.id] || ""}
                    onChange={(e) => setDialogResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRespondDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="bg-[#2f4b40] hover:opacity-90 text-white"
              disabled={submitting || !allDialogResponsesFilled}
              onClick={handleRespondAndSubmit}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Respond & Submit to Author
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicationMetadata;
