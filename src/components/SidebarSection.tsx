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
        borderBottom: '1px solid hsl(237 50% 17%)',
        borderLeft: open ? '3px solid hsl(206 82% 51%)' : '3px solid transparent',
        transition: 'border-left-color 0.2s',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between p-3 text-xs uppercase tracking-widest font-semibold cursor-pointer transition-all"
        style={{
          background: open ? 'hsl(237 50% 14%)' : 'hsl(237 50% 11%)',
          borderBottom: open ? '1px solid hsl(237 45% 19%)' : '1px solid transparent',
          color: open ? 'hsl(220 20% 90%)' : 'hsl(220 18% 64%)',
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
            color: open ? 'hsl(206 80% 62%)' : 'hsl(220 18% 40%)',
          }}
        />
      </button>
      {open && children}
    </div>
  );
}
