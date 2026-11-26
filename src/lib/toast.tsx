/**
 * Toast notifications — a class-based external store.
 * `ToastStore` owns state; React subscribes via useSyncExternalStore.
 * Call `toast.success("Note saved")` from anywhere (no provider needed).
 */
"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useSyncExternalStore } from "react";

export type ToastTone = "success" | "error" | "info";
export interface ToastItem { id: number; message: string; tone: ToastTone }

export class ToastStore {
  private items: ToastItem[] = [];
  private listeners = new Set<() => void>();
  private nextId = 1;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = (): ToastItem[] => this.items;

  push(message: string, tone: ToastTone = "info"): void {
    const id = this.nextId++;
    this.items = [...this.items.slice(-3), { id, message, tone }];
    this.emit();
    setTimeout(() => this.dismiss(id), 3400);
  }

  success(message: string) { this.push(message, "success"); }
  error(message: string) { this.push(message, "error"); }
  info(message: string) { this.push(message, "info"); }

  dismiss = (id: number): void => {
    if (!this.items.some((t) => t.id === id)) return;
    this.items = this.items.filter((t) => t.id !== id);
    this.emit();
  };

  private emit() { this.listeners.forEach((fn) => fn()); }
}

export const toast = new ToastStore();

const ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ICON_COLOR: Record<ToastTone, string> = {
  success: "text-[#9BD4A8]",
  error: "text-[#F2A48E]",
  info: "text-[#D8C9A8]",
};

export function Toaster() {
  const items = useSyncExternalStore(toast.subscribe, toast.getSnapshot, toast.getSnapshot);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4">
      {items.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <button
            key={t.id}
            onClick={() => toast.dismiss(t.id)}
            className="animate-toast-in pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-left text-sm text-paper shadow-xl shadow-ink/20"
          >
            <Icon size={16} className={ICON_COLOR[t.tone]} />
            <span>{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}