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
    <div
      className="flex flex-col"
      style={{
        borderBottom: '1px solid hsl(222 47% 22%)',
        borderLeft: open ? '3px solid hsl(211 100% 50%)' : '3px solid transparent',
        transition: 'border-left-color 0.2s',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between p-3 text-xs uppercase tracking-widest font-semibold cursor-pointer transition-all"
        style={{
          background: open ? 'hsl(222 47% 20%)' : 'hsl(222 47% 17%)',
          borderBottom: open ? '1px solid hsl(222 47% 26%)' : '1px solid transparent',
          color: open ? 'hsl(210 35% 92%)' : 'hsl(210 25% 72%)',
          fontFamily: 'var(--font-ui)',
          letterSpacing: '0.07em',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        <span className="flex items-center gap-2">
          {icon && <span style={{ fontSize: '13px' }}>{icon}</span>}
          {title}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform duration-200"
          style={{
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            color: open ? 'hsl(211 80% 62%)' : 'hsl(210 20% 52%)',
          }}
        />
      </button>
      {open && children}
    </div>
  );
}
