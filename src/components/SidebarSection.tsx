import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: string;
}

export default function SidebarSection({ title, children, defaultOpen = true, icon }: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col" style={{ borderBottom: '2px solid hsl(0 0% 20%)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between p-3 text-xs uppercase tracking-widest font-semibold cursor-pointer hover:brightness-110 transition-all"
        style={{ background: 'hsl(0 0% 17%)', borderBottom: '1px solid hsl(0 0% 20%)', color: 'hsl(0 0% 80%)' }}
      >
        <span className="flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform duration-200"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>
      {open && children}
    </div>
  );
}
