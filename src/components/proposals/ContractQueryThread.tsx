import React, { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, AlertTriangle, MessageSquare, MessageCircleQuestion, Reply, Clock, Tag, ChevronDown } from "lucide-react";
import { ContractQuery } from "@/lib/proposalsApi";
import { cn } from "@/lib/utils";

const QUERY_CATEGORIES = [
{ value: "contract", label: "Contract" },
{ value: "feedback", label: "Peer Review Feedback" }];


interface ContractQueryThreadProps {
  queries: ContractQuery[];
  isLoading: boolean;
  viewAs: "author" | "reviewer";
  proposalStatus: string;
  onSend: (text: string, category?: string, queryId?: number) => Promise<void>;
  isSending: boolean;
  hasActiveContract?: boolean;
  readOnly?: boolean;
}

const ContractQueryThread: React.FC<ContractQueryThreadProps> = ({
  queries,
  isLoading,
  viewAs,
  proposalStatus,
  onSend,
  isSending,
  hasActiveContract = false,
  readOnly = false,
}) => {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("contract");
  const [selectedQueryId, setSelectedQueryId] = useState<string>("");
  const threadEndRef = useRef<HTMLDivElement>(null);

  const normalizedStatus = proposalStatus?.trim().toLowerCase().replace(/\s+/g, "_");
  const isQueriesRaised = normalizedStatus === "queries_raised";
  const isContractIssued = normalizedStatus === "contract_issued";

  const canSend =
  viewAs === "author" ?
  isContractIssued || isQueriesRaised || hasActiveContract :
  isQueriesRaised;

  // Check if author has a pending query (no response yet)
  const responseParentIds = new Set(
    queries.filter((q) => q.type === "response" && q.parent_query_id).map((q) => q.parent_query_id)
  );
  const hasPendingAuthorQuery = queries.
  filter((q) => q.type === "query").
  some((q) => !responseParentIds.has(q.id));
  const authorCanRaise = viewAs === "author" ? !hasPendingAuthorQuery : true;

  const authorQueries = queries.filter((q) => q.type === "query");
  const unansweredQueries = authorQueries.filter((q) => !responseParentIds.has(q.id));

  // Build a map of responses keyed by parent_query_id
  const responsesByParent = new Map<number, ContractQuery[]>();
  queries.forEach((q) => {
    if (q.type === "response" && q.parent_query_id) {
      const existing = responsesByParent.get(q.parent_query_id) || [];
      existing.push(q);
      responsesByParent.set(q.parent_query_id, existing);
    }
  });

  // Auto-select the single unanswered query for DR (since only one can exist at a time)
  useEffect(() => {
    if (viewAs === "reviewer" && unansweredQueries.length === 1) {
      setSelectedQueryId(String(unansweredQueries[0].id));
    }
  }, [viewAs, unansweredQueries]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [queries.length]);

  const handleSubmit = async () => {
    if (!text.trim() || isSending) return;
    if (viewAs === "reviewer" && !selectedQueryId) return;
    const qId = viewAs === "reviewer" ? Number(selectedQueryId) : undefined;
    await onSend(text.trim(), category, qId);
    setText("");
    setSelectedQueryId("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading conversation…</span>
      </div>);

  }

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const renderMessage = (q: ContractQuery) => {
    const isQuery = q.type === "query";
    const alignRight = viewAs === "author" && !isQuery || viewAs === "reviewer" && isQuery;
    const messageText = q.text || q.query_text || q.response_text || "";
    const senderName = q.raised_by_name || q.created_by || (isQuery ? "Author" : "Reviewer");
    const categoryLabelMap: Record<string, string> = { feedback: "Peer Review Feedback" };
    const categoryLabel = q.category ? categoryLabelMap[q.category] || q.category.charAt(0).toUpperCase() + q.category.slice(1) : null;
    const initials = getInitials(senderName);

    return (
      <div
        key={q.id}
        className={cn(
          "flex gap-2.5 group",
          alignRight ? "flex-row-reverse" : "flex-row"
        )}>
        
        {/* Avatar */}
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5",
            isQuery ?
            "bg-blue-100 text-blue-700" :
            "bg-emerald-100 text-emerald-700"
          )}>
          
          {initials}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-3 space-y-1.5 shadow-sm",
            isQuery ?
            "bg-slate-50 border border-slate-200" :
            "bg-emerald-50 border border-emerald-200",
            alignRight ? "rounded-tr-md" : "rounded-tl-md"
          )}>
          
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {senderName}
            </span>
            {categoryLabel &&
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] px-1.5 py-0 gap-0.5 font-medium",
                isQuery ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"
              )}>
              
                <Tag className="h-2.5 w-2.5" />
                {categoryLabel}
              </Badge>
            }
          </div>

          {/* Message body */}
          <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90"
            dangerouslySetInnerHTML={{
              __html: messageText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            }}
          />

          {/* Timestamp footer */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/70">
              {format(new Date(q.created_at), "MMM d, yyyy · h:mm a")}
            </span>
          </div>
        </div>
      </div>);

  };

  return (
    <div className="space-y-5">
      {/* Status banner for DR */}
      {viewAs === "reviewer" && isQueriesRaised &&
      <div className="flex items-center gap-3 p-3.5 border border-amber-300/50 bg-amber-50 rounded-xl">
          <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Author has raised queries</p>
            <p className="text-xs text-amber-700/80">
              Respond to re-enable the contract signing button for the author.
            </p>
          </div>
        </div>
      }

      {/* Status banner for Author */}
      {viewAs === "author" && isQueriesRaised &&
      <div className="flex items-center gap-3 p-3.5 border border-blue-300/50 bg-blue-50 rounded-xl">
          <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Clock className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900">Awaiting editorial response</p>
            <p className="text-xs text-blue-700/80">
              Signing is paused until the editorial team responds. You may raise additional queries below.
            </p>
          </div>
        </div>
      }

      {/* Thread */}
      {queries.length === 0 ?
      <div className="py-10 text-center flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">No queries yet</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {viewAs === "author" ?
            "Have a question about the contract? Ask below." :
            "No queries from the author yet."}
            </p>
          </div>
        </div> :

      <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 scroll-smooth">
          {queries.map(renderMessage)}
          <div ref={threadEndRef} />
        </div>
      }

      {/* Input area */}
      {canSend && !readOnly &&
      <div className="bg-muted/30 rounded-xl border p-4 space-y-3">
          {viewAs === "author" && !authorCanRaise ? (
        /* Author has a pending query — must wait for DR response */
        <div className="flex items-center gap-3 p-3 border border-amber-300/50 bg-amber-50 rounded-lg">
              <Clock className="h-4.5 w-4.5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Awaiting response</p>
                <p className="text-xs text-amber-700/80">
                  Please wait until the editor responds before raising another query
                </p>
              </div>
            </div>) :

        <>
              <div className="flex items-center gap-2 mb-1">
                {viewAs === "author" ?
            <MessageCircleQuestion className="h-4 w-4 text-blue-600" /> :

            <Reply className="h-4 w-4 text-emerald-600" />
            }
                <span className="text-sm font-semibold">
                  {viewAs === "author" ? "Raise a Query" : "Respond to Query"}
                </span>
              </div>

              {/* Author category selector */}
              {viewAs === "author" &&
          <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUERY_CATEGORIES.map((cat) =>
                <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                )}
                    </SelectContent>
                  </Select>
                </div>
          }

              {/* DR: show which query is being responded to (auto-selected) */}
              {viewAs === "reviewer" && unansweredQueries.length > 0 &&
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background rounded-md px-3 py-2 border">
                  <Reply className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Responding to: <span className="font-medium text-foreground">
                      {(unansweredQueries[0].text || unansweredQueries[0].query_text || "").substring(0, 80)}
                      {(unansweredQueries[0].text || unansweredQueries[0].query_text || "").length > 80 ? "…" : ""}
                    </span>
                  </span>
                </div>
          }

              {/* Text input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {viewAs === "author" ? "Your question" : "Your response"}
                </label>
                <Textarea
              className="bg-background resize-none"
              placeholder={
              viewAs === "author" ?
              "Describe your question about the contract…" :
              "Type your response to the author's query…"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3} />
            
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between pt-1">
                <Button
              size="sm"
              className={cn(
                "gap-2 shadow-sm",
                viewAs === "author" ?
                "bg-blue-600 hover:bg-blue-700 text-white" :
                "bg-emerald-600 hover:bg-emerald-700 text-white"
              )}
              onClick={handleSubmit}
              disabled={isSending || !text.trim() || viewAs === "reviewer" && !selectedQueryId}>
              
                  {isSending ?
              <Loader2 className="h-4 w-4 animate-spin" /> :

              <Send className="h-4 w-4" />
              }
                  {viewAs === "author" ? "Submit Query" : "Send Response"}
                </Button>
              </div>
            </>
        }
        </div>
      }
    </div>);

};

export default ContractQueryThread;