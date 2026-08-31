import axios from "axios";
import api from "@/lib/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.ethicspress.com";

export type ContributorStatus = "pending" | "accepted" | "declined";

export interface Contributor {
  id: number;
  name: string;
  email: string;
  affiliation?: string | null;
  chapter_title?: string | null;
  notes?: string | null;
  status: ContributorStatus;
  invited_at?: string | null;
  responded_at?: string | null;
}

export interface ContributorCounts {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
}

export interface ContributorsResponse {
  contributors: Contributor[];
  counts: ContributorCounts;
}

export interface ContributorInput {
  name: string;
  email: string;
  affiliation?: string;
  chapter_title?: string;
  notes?: string;
}

const base = (ticketNumber: string) => `/api/proposals/${encodeURIComponent(ticketNumber)}`;

export const contributorsApi = {
  list: async (ticketNumber: string): Promise<ContributorsResponse> => {
    const { data } = await api.get(`${base(ticketNumber)}/contributors`);
    const contributors: Contributor[] = Array.isArray(data)
      ? data
      : data?.contributors || [];
    const counts: ContributorCounts = data?.counts || {
      total: contributors.length,
      pending: contributors.filter((c) => c.status === "pending").length,
      accepted: contributors.filter((c) => c.status === "accepted").length,
      declined: contributors.filter((c) => c.status === "declined").length,
    };
    return { contributors, counts };
  },

  create: async (
    ticketNumber: string,
    payload: ContributorInput
  ): Promise<{ contributor: Contributor; email_sent: boolean }> => {
    const { data } = await api.post(`${base(ticketNumber)}/contributors`, payload);
    return { contributor: data?.contributor || data, email_sent: !!data?.email_sent };
  },

  remove: async (ticketNumber: string, id: number | string): Promise<void> => {
    await api.delete(`${base(ticketNumber)}/contributors/${encodeURIComponent(String(id))}`);
  },

  resend: async (
    ticketNumber: string,
    id: number | string
  ): Promise<{ email_sent: boolean }> => {
    const { data } = await api.post(
      `${base(ticketNumber)}/contributors/${encodeURIComponent(String(id))}/resend`
    );
    return { email_sent: !!data?.email_sent };
  },
};

/* ---------- Public (no auth) contributor confirmation ---------- */

export interface ContributorConfirmInfo {
  book_title?: string | null;
  editor_name?: string | null;
  contributor_name?: string | null;
  chapter_title?: string | null;
  status: ContributorStatus;
  [key: string]: any;
}

const publicClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

export const contributorConfirmApi = {
  get: async (token: string): Promise<ContributorConfirmInfo> => {
    const { data } = await publicClient.get(
      `/api/proposals/contributors/confirm/${encodeURIComponent(token)}`
    );
    return data?.contributor ? { ...data.contributor, ...data } : data;
  },

  respond: async (token: string, action: "accept" | "decline"): Promise<any> => {
    const { data } = await publicClient.post(
      `/api/proposals/contributors/confirm/${encodeURIComponent(token)}`,
      { action }
    );
    return data;
  },
};

/* ---------- Co-Authors ---------- */

export interface CoAuthor {
  index: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  role: "author" | "editor" | string;
  editable?: boolean;
}

export interface CoAuthorsResponse {
  co_authors: CoAuthor[];
  editable: boolean;
}

export const coAuthorsApi = {
  list: async (ticketNumber: string): Promise<CoAuthorsResponse> => {
    const { data } = await api.get(`${base(ticketNumber)}/co-authors`);
    const co_authors: CoAuthor[] = Array.isArray(data) ? data : data?.co_authors || [];
    return { co_authors, editable: data?.editable !== false };
  },

  create: async (
    ticketNumber: string,
    payload: { first_name: string; last_name: string; email?: string; role: "author" | "editor" }
  ): Promise<CoAuthor> => {
    const { data } = await api.post(`${base(ticketNumber)}/co-authors`, payload);
    return data?.co_author || data;
  },

  remove: async (ticketNumber: string, index: number): Promise<void> => {
    await api.delete(`${base(ticketNumber)}/co-authors/${encodeURIComponent(String(index))}`);
  },
};
