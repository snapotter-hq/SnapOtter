import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { generateId } from "@/lib/utils";

const safeSessionStorage: StateStorage = {
  getItem: (name) => {
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      sessionStorage.setItem(name, value);
    } catch {
      // Storage blocked or full
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name);
    } catch {
      // Storage blocked
    }
  },
};

export interface PipelineStep {
  id: string;
  toolId: string;
  settings: Record<string, unknown>;
}

export interface SavedPipeline {
  id: string;
  name: string;
  description: string | null;
  steps: Array<{ toolId: string; settings: Record<string, unknown> }>;
  createdAt: string;
}

interface PipelineState {
  steps: PipelineStep[];
  expandedStepId: string | null;
  savedPipelines: SavedPipeline[];

  addStep: (toolId: string) => void;
  removeStep: (id: string) => void;
  reorderSteps: (activeId: string, overId: string) => void;
  updateStepSettings: (id: string, settings: Record<string, unknown>) => void;
  setExpandedStep: (id: string | null) => void;
  loadSteps: (steps: Array<{ toolId: string; settings: Record<string, unknown> }>) => void;
  setSavedPipelines: (pipelines: SavedPipeline[]) => void;
  reset: () => void;
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set, get) => ({
      steps: [],
      expandedStepId: null,
      savedPipelines: [],

      addStep: (toolId) => {
        const step: PipelineStep = { id: generateId(), toolId, settings: {} };
        set({ steps: [...get().steps, step], expandedStepId: step.id });
      },

      removeStep: (id) => {
        const { steps, expandedStepId } = get();
        set({
          steps: steps.filter((s) => s.id !== id),
          expandedStepId: expandedStepId === id ? null : expandedStepId,
        });
      },

      reorderSteps: (activeId, overId) => {
        const { steps } = get();
        const oldIndex = steps.findIndex((s) => s.id === activeId);
        const newIndex = steps.findIndex((s) => s.id === overId);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = [...steps];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);
        set({ steps: reordered });
      },

      updateStepSettings: (id, settings) => {
        set({ steps: get().steps.map((s) => (s.id === id ? { ...s, settings } : s)) });
      },

      setExpandedStep: (id) => set({ expandedStepId: id }),

      loadSteps: (rawSteps) => {
        const steps = rawSteps.map((s) => ({
          id: generateId(),
          toolId: s.toolId,
          settings: { ...s.settings },
        }));
        set({ steps, expandedStepId: null });
      },

      setSavedPipelines: (pipelines) => set({ savedPipelines: pipelines }),

      reset: () => set({ steps: [], expandedStepId: null, savedPipelines: [] }),
    }),
    {
      name: "snapotter-pipeline",
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (state) => ({
        steps: state.steps,
        expandedStepId: state.expandedStepId,
      }),
    },
  ),
);
