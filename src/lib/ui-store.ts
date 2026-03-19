import { create } from "zustand";
import type {
  AnalyzeCandidatesResponse,
  CacheCategory,
  CleanCachesResponse,
  KillResponse,
  PageKey,
  WorkspaceView,
} from "@/lib/types";

interface UiState {
  page: PageKey;
  workspaceView: WorkspaceView;
  search: string;
  selectedCandidateId: string | null;
  selectedCandidateIds: string[];
  selectedCacheCategories: CacheCategory[];
  analysis: AnalyzeCandidatesResponse | null;
  killResponse: KillResponse | null;
  cleanResponse: CleanCachesResponse | null;
  setPage: (page: PageKey) => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  setSearch: (search: string) => void;
  setSelectedCandidateId: (candidateId: string | null) => void;
  toggleCandidate: (candidateId: string) => void;
  replaceSelectedCandidates: (candidateIds: string[]) => void;
  clearSelectedCandidates: () => void;
  toggleCacheCategory: (category: CacheCategory) => void;
  replaceCacheCategories: (categories: CacheCategory[]) => void;
  setAnalysis: (analysis: AnalyzeCandidatesResponse | null) => void;
  setKillResponse: (response: KillResponse | null) => void;
  setCleanResponse: (response: CleanCachesResponse | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  page: "workspace",
  workspaceView: "ports",
  search: "",
  selectedCandidateId: null,
  selectedCandidateIds: [],
  selectedCacheCategories: [],
  analysis: null,
  killResponse: null,
  cleanResponse: null,
  setPage: (page) => set({ page }),
  setWorkspaceView: (workspaceView) => set({ workspaceView }),
  setSearch: (search) => set({ search }),
  setSelectedCandidateId: (selectedCandidateId) => set({ selectedCandidateId }),
  toggleCandidate: (candidateId) =>
    set((state) => ({
      selectedCandidateIds: state.selectedCandidateIds.includes(candidateId)
        ? state.selectedCandidateIds.filter((value) => value !== candidateId)
        : [...state.selectedCandidateIds, candidateId],
    })),
  replaceSelectedCandidates: (selectedCandidateIds) => set({ selectedCandidateIds }),
  clearSelectedCandidates: () => set({ selectedCandidateIds: [] }),
  toggleCacheCategory: (category) =>
    set((state) => ({
      selectedCacheCategories: state.selectedCacheCategories.includes(category)
        ? state.selectedCacheCategories.filter((value) => value !== category)
        : [...state.selectedCacheCategories, category],
    })),
  replaceCacheCategories: (selectedCacheCategories) => set({ selectedCacheCategories }),
  setAnalysis: (analysis) => set({ analysis }),
  setKillResponse: (killResponse) => set({ killResponse }),
  setCleanResponse: (cleanResponse) => set({ cleanResponse }),
}));
