"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Menu, X } from "lucide-react";
import { Brand } from "./shell-parts";
import { PrimaryNav } from "./primary-nav";
import { roleHome, type Role } from "./navigation";

/** Sidebar navigation as a left drawer below lg: focus trap, Escape and overlay click close it. */
export function MobileDrawer({ role, label }: { role: Role; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="btn btn-ghost btn-icon lg:hidden">
        <Menu aria-hidden="true" className="size-5" />
        <span className="sr-only">Open menu</span>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-overlay duration-150 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left">
          <div className="flex h-header items-center justify-between border-b border-border-subtle px-4">
            <Brand href={roleHome[role]} />
            <DialogPrimitive.Close className="btn btn-ghost btn-icon">
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Close menu</span>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Main navigation
          </DialogPrimitive.Description>
          <PrimaryNav
            role={role}
            variant="sidebar"
            label={label}
            onNavigate={() => setOpen(false)}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
