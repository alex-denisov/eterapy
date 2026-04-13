"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function AccordionItem({ title, children, defaultOpen = false, className }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("border-b border-border/20", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-colors hover:text-primary focus:outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 md:text-base"
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200",
          open ? "grid-rows-[1fr] pb-4 opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface AccordionProps {
  items: { title: string; content: React.ReactNode; defaultOpen?: boolean }[];
  className?: string;
}

export function Accordion({ items, className }: AccordionProps) {
  return (
    <div className={cn("divide-y divide-border/20", className)}>
      {items.map((item, i) => (
        <AccordionItem key={i} title={item.title} defaultOpen={item.defaultOpen}>
          {item.content}
        </AccordionItem>
      ))}
    </div>
  );
}
